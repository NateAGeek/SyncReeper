/**
 * Linux Syncthing Service
 *
 * Configures Syncthing to sync repositories across devices on Linux.
 * Syncthing runs as the configured service user via systemd.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand, writeFile, enableService } from "../../lib/command";
import { getServiceUser, getPaths } from "../../config/types";
import { generateStignoreContent } from "./stignore";
import type { SetupSyncthingOptions, SetupSyncthingResult } from "./types";

/**
 * Generates a bash script that configures Syncthing devices and folders via CLI.
 */
export function generateSyncthingCliConfigScript(
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

# Remove default folder if it exists
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
`;
}

/**
 * Sets up Syncthing on Linux
 * - Generates keys and initial config
 * - Configures devices/folders via CLI
 * - Runs as the configured service user
 */
export function setupSyncthingLinux(options: SetupSyncthingOptions): SetupSyncthingResult {
    const { config, dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];
    const { name: username } = getServiceUser();
    const { syncthingConfig } = getPaths();

    // Stop Syncthing if running (clean slate for configuration)
    const stopSyncthing = runCommand({
        name: "stop-syncthing-for-config",
        create: `systemctl stop syncthing@${username} 2>/dev/null || true`,
        dependsOn,
    });
    resources.push(stopSyncthing);

    // Create Syncthing config directory (group-readable for CLI access)
    const createConfigDir = runCommand({
        name: "syncthing-config-dir",
        create: `
            mkdir -p ${syncthingConfig}
            chown ${username}:${username} ${syncthingConfig}
            chmod 750 ${syncthingConfig}
        `.trim(),
        dependsOn: [stopSyncthing],
    });
    resources.push(createConfigDir);

    // Generate Syncthing keys and initial config
    const generateKeys = runCommand({
        name: "syncthing-generate-keys",
        create: `
            if [ ! -f ${syncthingConfig}/cert.pem ]; then
                echo "Generating Syncthing keys..."
                sudo -u ${username} syncthing generate --config=${syncthingConfig}
                echo "Generated Syncthing keys and initial config"
            else
                echo "Syncthing keys already exist, skipping generation"
            fi
        `.trim(),
        dependsOn: [createConfigDir],
    });
    resources.push(generateKeys);

    // Create .stignore file
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
    const enableSyncthing = enableService({
        name: "enable-syncthing",
        service: `syncthing@${username}`,
        start: true,
        enable: true,
        dependsOn: [generateKeys],
    });
    resources.push(enableSyncthing);

    // Wait for Syncthing to be ready
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

    // Restart Syncthing to apply configuration
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
# Works for any user in the '${username}' group

set -e

CONFIG_DIR="${syncthingConfig}"

# Check if user can read the config
if [ ! -r "$CONFIG_DIR/cert.pem" ]; then
    echo "Error: Cannot read Syncthing config at $CONFIG_DIR"
    echo ""
    echo "To fix, add yourself to the ${username} group:"
    echo "  sudo usermod -aG ${username} \\$(whoami)"
    echo "  # Then log out and back in"
    exit 1
fi

DEVICE_ID=$(syncthing device-id --config="$CONFIG_DIR" 2>/dev/null || echo "")

if [ -z "$DEVICE_ID" ]; then
    echo "Error: Could not get Syncthing device ID."
    echo "Make sure Syncthing has been initialized."
    exit 1
fi

echo "Syncthing Device ID:"
echo "$DEVICE_ID"
echo ""
echo "Add this device ID to your other Syncthing instances."
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

    // Verify Syncthing is running
    const verifySyncthing = runCommand({
        name: "verify-syncthing",
        create: `
            echo "Verifying Syncthing configuration..."
            systemctl status syncthing@${username} --no-pager || true
            echo ""
            echo "Device ID:"
            syncthing device-id --config=${syncthingConfig} 2>/dev/null || echo "Could not get device ID"
            echo ""
            echo "Syncthing configured successfully!"
            echo "Access GUI via SSH tunnel: ssh -L 8384:localhost:8384 your-vps"
        `.trim(),
        dependsOn: [restartSyncthing],
    });
    resources.push(verifySyncthing);

    return { resources };
}
