/**
 * Syncthing Service
 *
 * Configures Syncthing to sync repositories across devices.
 * Syncthing runs as the syncreeper user and communicates via relay servers.
 * The GUI is only accessible via SSH tunnel (localhost only by default).
 *
 * Configuration approach:
 * 1. Generate initial config and keys using `syncthing generate`
 * 2. Configure devices and folders using `syncthing cli` as the syncreeper user
 *    (CLI reads from config.xml directly when run as the correct user)
 *
 * Note: Syncthing is installed by the packages service.
 * This service only handles configuration.
 */

import type * as pulumi from "@pulumi/pulumi";
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
 * Generates a bash script that configures Syncthing devices and folders via CLI.
 * All commands run as the syncreeper user so the CLI can read from config.xml directly.
 */
function generateSyncthingCliConfigScript(
    trustedDevices: string[],
    folderId: string,
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
echo "Adding device: ${deviceName} (${deviceId})..."
sudo -u ${username} syncthing cli config devices add --device-id "${deviceId}" --name "${deviceName}" 2>/dev/null || echo "Device may already exist, continuing..."`;
        })
        .join("\n");

    // Build commands to share folder with each device
    const shareFolderCommands = trustedDevices
        .map((deviceId, index) => {
            const deviceName = `Device-${index + 1}`;
            return `
# Share folder with ${deviceName}
echo "Sharing folder '${folderId}' with ${deviceName}..."
sudo -u ${username} syncthing cli config folders "${folderId}" devices add --device-id "${deviceId}" 2>/dev/null || echo "Device may already be shared, continuing..."`;
        })
        .join("\n");

    return `#!/bin/bash
set -e

echo "Configuring Syncthing via CLI..."
echo ""

# Remove default folder if it exists (Syncthing creates a "Default Folder" on first run)
echo "Removing default folder if present..."
sudo -u ${username} syncthing cli config folders remove "default" 2>/dev/null || true

# Create the repos folder
echo ""
echo "Creating folder: ${folderId}"
sudo -u ${username} syncthing cli config folders add --id "${folderId}" --path "${reposPath}" --label "${folderLabel}" 2>/dev/null || echo "Folder may already exist, continuing..."

# Add trusted devices
echo ""
echo "Adding trusted devices..."
${addDeviceCommands}

# Share the repos folder with each trusted device
echo ""
echo "Sharing folder with trusted devices..."
${shareFolderCommands}

echo ""
echo "Syncthing CLI configuration complete!"
echo ""
echo "Configured devices:"
sudo -u ${username} syncthing cli config devices list 2>/dev/null || echo "Could not list devices"
echo ""
echo "Configured folders:"
sudo -u ${username} syncthing cli config folders list 2>/dev/null || echo "Could not list folders"
`;
}

/**
 * Sets up Syncthing for repository synchronization
 * - Generates keys and initial config
 * - Configures devices/folders via CLI as syncreeper user
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

    // Enable and start Syncthing service
    // The service needs to be running for CLI to work (it uses the REST API internally)
    const enableSyncthing = enableService({
        name: "enable-syncthing",
        service: `syncthing@${username}`,
        start: true,
        enable: true,
        dependsOn: [generateKeys],
    });
    resources.push(enableSyncthing);

    // Wait for Syncthing to be ready before configuring
    const waitForSyncthing = runCommand({
        name: "wait-for-syncthing",
        create: `
            echo "Waiting for Syncthing to be ready..."
            for i in $(seq 1 30); do
                if sudo -u ${username} syncthing cli config devices list >/dev/null 2>&1; then
                    echo "Syncthing is ready"
                    exit 0
                fi
                echo "Waiting... ($i/30)"
                sleep 1
            done
            echo "Warning: Syncthing may not be fully ready, proceeding anyway..."
        `.trim(),
        dependsOn: [enableSyncthing],
    });
    resources.push(waitForSyncthing);

    // Configure Syncthing devices and folders via CLI
    const cliConfigScript = generateSyncthingCliConfigScript(
        config.syncthing.trustedDevices,
        config.syncthing.folderId,
        config.sync.reposPath,
        username
    );

    const configureSyncthing = runCommand({
        name: "configure-syncthing-cli",
        create: cliConfigScript,
        dependsOn: [waitForSyncthing],
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
