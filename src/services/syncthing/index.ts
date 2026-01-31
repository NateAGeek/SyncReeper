/**
 * Syncthing Service
 *
 * Configures Syncthing to sync repositories across devices.
 * Syncthing runs as the syncreeper user and communicates via relay servers.
 * The GUI is only accessible via SSH tunnel.
 *
 * Configuration approach:
 * 1. GUI settings (address, API key) are set via systemd environment variables
 *    (STGUIADDRESS, STGUIAPIKEY) which override config.xml at runtime
 * 2. Devices and folders are configured via the Syncthing CLI after the service starts
 *
 * Note: Syncthing is installed by the packages service.
 * This service only handles configuration.
 */

import * as pulumi from "@pulumi/pulumi";
import { runCommand, writeFile, enableService } from "../../lib/command.js";
import { PATHS, SERVICE_USER } from "../../config/types.js";
import type { SyncReeperConfig } from "../../config/types.js";
import { generateStignoreContent } from "./stignore.js";

export interface SetupSyncthingOptions {
    /** SyncReeper configuration */
    config: SyncReeperConfig;
    /** Resources to depend on */
    dependsOn?: pulumi.Resource[];
}

export interface SetupSyncthingResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
}

/**
 * Generates the systemd service override for Syncthing.
 * Returns parts that can be joined with the API key using pulumi.interpolate.
 *
 * Uses environment variables to configure:
 * - STHOME: Syncthing config directory
 * - STGUIADDRESS: GUI listen address (localhost only for security)
 * - STGUIAPIKEY: API key for authentication
 */
function generateServiceOverrideParts(): { before: string; after: string } {
    const { name: username, home } = SERVICE_USER;
    const guiAddress = "127.0.0.1:8384";

    const before = `[Service]
User=${username}
Group=${username}
Environment="STHOME=${home}/.config/syncthing"
Environment="STGUIADDRESS=${guiAddress}"
Environment="STGUIAPIKEY=`;

    const after = `"
`;

    return { before, after };
}

/**
 * Generates a bash script that configures Syncthing devices and folders via CLI.
 * The CLI uses the REST API internally but provides a convenient interface.
 *
 * The script is split into parts so the API key can be interpolated properly.
 * The API key is set as STGUIAPIKEY environment variable for CLI authentication.
 */
function generateSyncthingCliConfigParts(
    trustedDevices: string[],
    folderId: string,
    reposPath: string,
    _username: string
): { before: string; after: string } {
    const folderLabel = "GitHub Repositories";
    const configDir = PATHS.syncthingConfig;

    // Build commands to add each trusted device
    const addDeviceCommands = trustedDevices
        .map((deviceId, index) => {
            const deviceName = `Device-${index + 1}`;
            return `
# Add trusted device: ${deviceName}
echo "Adding device: ${deviceName} (${deviceId})..."
if ! syncthing cli config devices list 2>/dev/null | grep -q "${deviceId}"; then
    syncthing cli config devices add --device-id "${deviceId}" --name "${deviceName}" || echo "Warning: Failed to add device"
else
    echo "Device already exists"
fi`;
        })
        .join("\n");

    // Build commands to share folder with each device
    const shareFolderCommands = trustedDevices
        .map((deviceId, index) => {
            const deviceName = `Device-${index + 1}`;
            return `
# Share folder with ${deviceName}
echo "Sharing folder '${folderId}' with device ${deviceName}..."
syncthing cli config folders "${folderId}" devices add --device-id "${deviceId}" 2>/dev/null || true`;
        })
        .join("\n");

    // Part before API key - set up the script and export STGUIAPIKEY for CLI auth
    const before = `#!/bin/bash
set -e

echo "Configuring Syncthing via CLI..."

# Set API key for CLI authentication (CLI uses REST API internally)
export STGUIAPIKEY="`;

    // Part after API key
    const after = `"
export STHOME="${configDir}"

# Wait for Syncthing to be ready
echo "Waiting for Syncthing to be ready..."
for i in {1..30}; do
    if syncthing cli show system 2>/dev/null | grep -q "myID"; then
        echo "Syncthing is ready"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 1
done

# Get local device ID for reference
echo ""
echo "Local device ID:"
syncthing cli show system 2>/dev/null | grep -oP '"myID"\\s*:\\s*"\\K[^"]+' || echo "Could not get device ID"
echo ""

# Remove default folder if it exists (Syncthing creates a "Default Folder" on first run)
echo "Removing default folder if present..."
syncthing cli config folders remove "default" 2>/dev/null || true

# Create or update the repos folder
echo "Configuring folder: ${folderId}..."
if ! syncthing cli config folders list 2>/dev/null | grep -q "^${folderId}$"; then
    echo "Creating folder: ${folderId}"
    syncthing cli config folders add --id "${folderId}" --path "${reposPath}" --label "${folderLabel}" || { echo "Error: Failed to create folder"; exit 1; }
else
    echo "Folder ${folderId} already exists, updating path..."
    syncthing cli config folders "${folderId}" path set "${reposPath}" 2>/dev/null || true
fi

# Configure folder settings
echo "Configuring folder settings..."
syncthing cli config folders "${folderId}" rescan-interval-s set 3600 2>/dev/null || true
syncthing cli config folders "${folderId}" fs-watcher-enabled set true 2>/dev/null || true
syncthing cli config folders "${folderId}" type set "sendreceive" 2>/dev/null || true

# Add trusted devices
echo ""
echo "Adding trusted devices..."
${addDeviceCommands}

# Share the repos folder with each trusted device
echo ""
echo "Sharing folder with trusted devices..."
${shareFolderCommands}

echo ""
echo "Syncthing configuration complete!"
echo ""
echo "Configured devices:"
syncthing cli config devices list 2>/dev/null || echo "Could not list devices"
echo ""
echo "Configured folders:"
syncthing cli config folders list 2>/dev/null || echo "Could not list folders"
`;

    return { before, after };
}

/**
 * Sets up Syncthing for repository synchronization
 * - Generates keys and initial config
 * - Configures GUI via systemd environment variables
 * - Configures devices/folders via CLI after service starts
 * - Runs as syncreeper user
 * - Only listens on localhost (access via SSH tunnel)
 *
 * Prerequisites: Syncthing must be installed (handled by packages service)
 */
export function setupSyncthing(options: SetupSyncthingOptions): SetupSyncthingResult {
    const { config, dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];
    const { name: username } = SERVICE_USER;

    // Stop Syncthing if running (clean slate for configuration)
    const stopSyncthing = runCommand({
        name: "stop-syncthing-for-config",
        create: `systemctl stop syncthing@${username} 2>/dev/null || true`,
        dependsOn,
    });
    resources.push(stopSyncthing);

    // Create Syncthing config directory
    const createConfigDir = runCommand({
        name: "syncthing-config-dir",
        create: `
            mkdir -p ${PATHS.syncthingConfig}
            chown ${username}:${username} ${PATHS.syncthingConfig}
            chmod 700 ${PATHS.syncthingConfig}
        `.trim(),
        dependsOn: [stopSyncthing],
    });
    resources.push(createConfigDir);

    // Generate Syncthing keys and initial config (if they don't exist)
    // This creates cert.pem, key.pem, and a default config.xml
    const generateKeys = runCommand({
        name: "syncthing-generate-keys",
        create: `
            if [ ! -f ${PATHS.syncthingConfig}/cert.pem ]; then
                echo "Generating Syncthing keys..."
                sudo -u ${username} syncthing generate --config=${PATHS.syncthingConfig}
                echo "Generated Syncthing keys and initial config"
            else
                echo "Syncthing keys already exist, skipping generation"
            fi
        `.trim(),
        dependsOn: [createConfigDir],
    });
    resources.push(generateKeys);

    // Create .stignore file in repos directory
    // This file controls which files are NOT synced across devices
    const stignoreContent = generateStignoreContent();
    const writeStignore = writeFile({
        name: "syncthing-stignore",
        path: `${config.sync.reposPath}/.stignore`,
        content: stignoreContent,
        mode: "644",
        owner: username,
        group: username,
        dependsOn: [createConfigDir],
    });
    resources.push(writeStignore);

    // Create systemd service override directory
    const createOverrideDir = runCommand({
        name: "syncthing-override-dir",
        create: `mkdir -p /etc/systemd/system/syncthing@${username}.service.d`,
        delete: `rm -rf /etc/systemd/system/syncthing@${username}.service.d`,
        dependsOn,
    });
    resources.push(createOverrideDir);

    // Write systemd service override with GUI settings via environment variables
    // Use pulumi.interpolate to properly handle the API key secret
    const overrideParts = generateServiceOverrideParts();
    const serviceOverrideContent = pulumi.interpolate`${overrideParts.before}${config.syncthing.apiKey}${overrideParts.after}`;

    const writeOverride = runCommand({
        name: "syncthing-service-override",
        create: pulumi.interpolate`cat > /etc/systemd/system/syncthing@${username}.service.d/override.conf << 'OVERRIDE_EOF'
${serviceOverrideContent}OVERRIDE_EOF
chmod 644 /etc/systemd/system/syncthing@${username}.service.d/override.conf
systemctl daemon-reload`,
        delete: `rm -f /etc/systemd/system/syncthing@${username}.service.d/override.conf`,
        dependsOn: [createOverrideDir],
    });
    resources.push(writeOverride);

    // Enable and start Syncthing service
    const enableSyncthing = enableService({
        name: "enable-syncthing",
        service: `syncthing@${username}`,
        start: true,
        enable: true,
        dependsOn: [generateKeys, writeOverride],
    });
    resources.push(enableSyncthing);

    // Configure Syncthing devices and folders via CLI after it's running
    // Use pulumi.interpolate to properly handle the apiKey secret
    const cliScriptParts = generateSyncthingCliConfigParts(
        config.syncthing.trustedDevices,
        config.syncthing.folderId,
        config.sync.reposPath,
        username
    );
    const cliConfigScript = pulumi.interpolate`${cliScriptParts.before}${config.syncthing.apiKey}${cliScriptParts.after}`;

    const configureSyncthing = runCommand({
        name: "configure-syncthing-cli",
        create: cliConfigScript,
        dependsOn: [enableSyncthing],
    });
    resources.push(configureSyncthing);

    // Restart Syncthing to ensure all configuration is applied
    const restartSyncthing = runCommand({
        name: "restart-syncthing",
        create: `
            echo "Restarting Syncthing to apply configuration..."
            systemctl restart syncthing@${username}
            sleep 2
            echo "Syncthing restarted"
        `.trim(),
        dependsOn: [configureSyncthing, writeStignore],
    });
    resources.push(restartSyncthing);

    // Create convenience script to get device ID
    // Uses 'syncthing device-id' command which reads from the cert file (no API needed)
    const getDeviceIdScript = `#!/bin/bash
# Get the Syncthing device ID for this VPS
# Share this ID with other devices to allow them to connect

set -e

CONFIG_DIR="${PATHS.syncthingConfig}"

# Use syncthing device-id command (reads from cert, doesn't need running service)
if [ -f "$CONFIG_DIR/cert.pem" ]; then
    DEVICE_ID=$(syncthing device-id --config="$CONFIG_DIR" 2>/dev/null || echo "")
fi

if [ -z "$DEVICE_ID" ]; then
    echo "Error: Could not get Syncthing device ID."
    echo "Make sure Syncthing has been initialized."
    echo "Try: systemctl status syncthing@${username}"
    exit 1
fi

echo "Syncthing Device ID:"
echo "$DEVICE_ID"
echo ""
echo "Add this device ID to your other Syncthing instances"
echo "to sync the repositories folder."
`;

    const writeGetDeviceIdScript = writeFile({
        name: "get-device-id-script",
        path: "/usr/local/bin/syncreeper-device-id",
        content: getDeviceIdScript,
        mode: "755",
        owner: "root",
        group: "root",
        dependsOn: [restartSyncthing],
    });
    resources.push(writeGetDeviceIdScript);

    // Verify Syncthing is running and configured
    const verifySyncthing = runCommand({
        name: "verify-syncthing",
        create: `
            echo "Verifying Syncthing configuration..."
            systemctl status syncthing@${username} --no-pager || true
            echo ""
            echo "Device ID:"
            syncthing device-id --config=${PATHS.syncthingConfig} 2>/dev/null || echo "Could not get device ID"
            echo ""
            echo "Syncthing configured successfully!"
            echo "Access GUI via SSH tunnel: ssh -L 8384:localhost:8384 your-vps"
        `.trim(),
        dependsOn: [restartSyncthing],
    });
    resources.push(verifySyncthing);

    return { resources };
}

export { generateStignoreContent } from "./stignore.js";
