/**
 * Syncthing Service
 *
 * Configures Syncthing to sync repositories across devices.
 * Syncthing runs as the syncreeper user and communicates via relay servers.
 * The GUI is only accessible via SSH tunnel.
 *
 * Configuration is done via the Syncthing CLI after the service starts,
 * which is more robust than trying to generate config.xml directly.
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
 * Generates the systemd service override for Syncthing
 * Runs as syncreeper user instead of default
 */
function generateServiceOverride(): string {
    const { name: username, home } = SERVICE_USER;

    return `[Service]
User=${username}
Group=${username}
Environment="STHOME=${home}/.config/syncthing"
`;
}

/**
 * Generates a bash script that configures Syncthing via CLI commands
 * This approach is more robust than generating config.xml because:
 * 1. Syncthing manages its own config format/version
 * 2. CLI commands merge with existing config
 * 3. No risk of Syncthing overwriting our config
 */
function generateSyncthingCliConfig(
    trustedDevices: string[],
    folderId: string,
    apiKey: string,
    reposPath: string,
    username: string
): string {
    const folderLabel = "GitHub Repositories";

    // Build commands to add each trusted device
    const addDeviceCommands = trustedDevices
        .map((deviceId, index) => {
            const deviceName = `Device-${index + 1}`;
            return `
# Add trusted device: ${deviceName}
if ! sudo -u ${username} syncthing cli config devices list | grep -q "${deviceId}"; then
    echo "Adding device: ${deviceName} (${deviceId})"
    sudo -u ${username} syncthing cli config devices add --device-id "${deviceId}" --name "${deviceName}"
else
    echo "Device ${deviceName} already exists, updating name..."
    sudo -u ${username} syncthing cli config devices "${deviceId}" name set "${deviceName}"
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
sudo -u ${username} syncthing cli config folders "${folderId}" devices add --device-id "${deviceId}" 2>/dev/null || true`;
        })
        .join("\n");

    return `#!/bin/bash
set -e

echo "Configuring Syncthing via CLI..."

# Configure GUI to listen on localhost only (security)
echo "Setting GUI to localhost only..."
sudo -u ${username} syncthing cli config gui address set "127.0.0.1:8384"

# Set API key
echo "Setting API key..."
sudo -u ${username} syncthing cli config gui apikey set "${apiKey}"

# Remove default folder if it exists (Syncthing creates a "Default Folder" on first run)
echo "Removing default folder if present..."
sudo -u ${username} syncthing cli config folders remove "default" 2>/dev/null || true

# Create or update the repos folder
if ! sudo -u ${username} syncthing cli config folders list | grep -q "^${folderId}$"; then
    echo "Creating folder: ${folderId}"
    sudo -u ${username} syncthing cli config folders add --id "${folderId}" --path "${reposPath}" --label "${folderLabel}"
else
    echo "Folder ${folderId} already exists, updating configuration..."
    sudo -u ${username} syncthing cli config folders "${folderId}" path set "${reposPath}"
    sudo -u ${username} syncthing cli config folders "${folderId}" label set "${folderLabel}"
fi

# Configure folder settings
echo "Configuring folder settings..."
sudo -u ${username} syncthing cli config folders "${folderId}" rescan-interval-s set 3600
sudo -u ${username} syncthing cli config folders "${folderId}" fs-watcher-enabled set true
sudo -u ${username} syncthing cli config folders "${folderId}" type set "sendreceive"

# Add trusted devices
echo "Adding trusted devices..."
${addDeviceCommands}

# Share the repos folder with each trusted device
echo "Sharing folder with trusted devices..."
${shareFolderCommands}

echo ""
echo "Syncthing configuration complete!"
echo ""
echo "Configured devices:"
sudo -u ${username} syncthing cli config devices list
echo ""
echo "Configured folders:"
sudo -u ${username} syncthing cli config folders list
`;
}

/**
 * Sets up Syncthing for repository synchronization
 * - Generates keys and initial config
 * - Configures via CLI after service starts
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

    // Write systemd service override
    const serviceOverride = generateServiceOverride();
    const writeOverride = writeFile({
        name: "syncthing-service-override",
        path: `/etc/systemd/system/syncthing@${username}.service.d/override.conf`,
        content: serviceOverride,
        mode: "644",
        owner: "root",
        group: "root",
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

    // Configure Syncthing via CLI after it's running
    // Use pulumi.interpolate to handle the apiKey secret
    const cliConfigScript = pulumi.interpolate`${generateSyncthingCliConfig(
        config.syncthing.trustedDevices,
        config.syncthing.folderId,
        config.syncthing.apiKey,
        config.sync.reposPath,
        username
    )}`;

    const configureSyncthing = runCommand({
        name: "configure-syncthing-cli",
        create: cliConfigScript,
        dependsOn: [enableSyncthing],
    });
    resources.push(configureSyncthing);

    // Restart Syncthing to apply all CLI configuration changes
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
    const getDeviceIdScript = `#!/bin/bash
# Get the Syncthing device ID for this VPS
# Share this ID with other devices to allow them to connect

set -e

# Get device ID via CLI
DEVICE_ID=$(sudo -u ${username} syncthing cli show system 2>/dev/null | grep -oP '"myID":\\s*"\\K[^"]+')

if [ -z "$DEVICE_ID" ]; then
    echo "Error: Could not get Syncthing device ID. Is Syncthing running?"
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
            sudo -u ${username} syncthing cli show system | grep -oP '"myID":\\s*"\\K[^"]+' || true
            echo ""
            echo "Configured devices:"
            sudo -u ${username} syncthing cli config devices list || true
            echo ""
            echo "Configured folders:"
            sudo -u ${username} syncthing cli config folders list || true
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
