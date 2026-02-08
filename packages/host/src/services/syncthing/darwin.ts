/**
 * macOS Syncthing Service
 *
 * Configures Syncthing to sync repositories across devices on macOS.
 * Syncthing is installed via Homebrew and managed via brew services.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand, writeFile } from "../../lib/command";
import { enableBrewService } from "../../lib/command.darwin";
import { getPaths } from "../../config/types";
import { generateStignoreContent } from "./stignore";
import type { SetupSyncthingOptions, SetupSyncthingResult } from "./types";

/**
 * Generates a bash script that configures Syncthing devices and folders via CLI.
 */
export function generateSyncthingCliConfigScript(
    trustedDevices: string[],
    folderId: string,
    reposPath: string,
    _syncthingConfig: string
): string {
    const folderLabel = "GitHub Repositories";

    // Build commands to add each trusted device
    const addDeviceCommands = trustedDevices
        .map((deviceId, index) => {
            const deviceName = `Device-${index + 1}`;
            return `
# Add trusted device: ${deviceName}
echo "Adding device: ${deviceName} (${deviceId})..."
syncthing cli config devices add --device-id "${deviceId}" --name "${deviceName}" 2>/dev/null || echo "Device may already exist, continuing..."`;
        })
        .join("\n");

    // Build commands to share folder with each device
    const shareFolderCommands = trustedDevices
        .map((deviceId, index) => {
            const deviceName = `Device-${index + 1}`;
            return `
# Share folder with ${deviceName}
echo "Sharing folder '${folderId}' with ${deviceName}..."
syncthing cli config folders "${folderId}" devices add --device-id "${deviceId}" 2>/dev/null || echo "Device may already be shared, continuing..."`;
        })
        .join("\n");

    return `#!/bin/bash
set -e

export HOME="$HOME"

echo "Configuring Syncthing via CLI..."
echo ""

# Remove default folder if it exists
echo "Removing default folder if present..."
syncthing cli config folders remove "default" 2>/dev/null || true

# Create the repos folder
echo ""
echo "Creating folder: ${folderId}"
syncthing cli config folders add --id "${folderId}" --path "${reposPath}" --label "${folderLabel}" 2>/dev/null || echo "Folder may already exist, continuing..."

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
 * Sets up Syncthing on macOS
 * - Uses Homebrew-installed Syncthing
 * - Manages via brew services
 * - Configures devices/folders via CLI
 */
export function setupSyncthingDarwin(options: SetupSyncthingOptions): SetupSyncthingResult {
    const { config, dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];

    const paths = getPaths();

    // Stop Syncthing if running (clean slate for configuration)
    const stopSyncthing = runCommand({
        name: "stop-syncthing-for-config",
        create: `brew services stop syncthing 2>/dev/null || true`,
        dependsOn,
    });
    resources.push(stopSyncthing);

    // Create Syncthing config directory
    const createConfigDir = runCommand({
        name: "syncthing-config-dir",
        create: `
            mkdir -p "${paths.syncthingConfig}"
            chmod 700 "${paths.syncthingConfig}"
        `.trim(),
        dependsOn: [stopSyncthing],
    });
    resources.push(createConfigDir);

    // Create repos directory
    const createReposDir = runCommand({
        name: "create-repos-dir",
        create: `
            mkdir -p "${config.sync.reposPath}"
            chmod 755 "${config.sync.reposPath}"
        `.trim(),
        dependsOn: [stopSyncthing],
    });
    resources.push(createReposDir);

    // Generate Syncthing keys and initial config (if they don't exist)
    const generateKeys = runCommand({
        name: "syncthing-generate-keys",
        create: `
            if [ ! -f "${paths.syncthingConfig}/cert.pem" ]; then
                echo "Generating Syncthing keys..."
                syncthing generate --config="${paths.syncthingConfig}"
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
        dependsOn: [createReposDir],
    });
    resources.push(writeStignore);

    // Start Syncthing via brew services
    const enableSyncthing = enableBrewService({
        name: "enable-syncthing",
        service: "syncthing",
        start: true,
        dependsOn: [generateKeys],
    });
    resources.push(enableSyncthing);

    // Wait for Syncthing to be ready
    const waitForSyncthing = runCommand({
        name: "wait-for-syncthing",
        create: `
            echo "Waiting for Syncthing to be ready..."
            for i in $(seq 1 30); do
                if syncthing cli config devices list >/dev/null 2>&1; then
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
        paths.syncthingConfig
    );

    const configureSyncthing = runCommand({
        name: "configure-syncthing-cli",
        create: cliConfigScript,
        dependsOn: [waitForSyncthing],
    });
    resources.push(configureSyncthing);

    // Restart Syncthing to apply configuration
    const restartSyncthing = enableBrewService({
        name: "restart-syncthing",
        service: "syncthing",
        restart: true,
        dependsOn: [configureSyncthing, writeStignore],
    });
    resources.push(restartSyncthing);

    // Create convenience script to get device ID
    const getDeviceIdScript = `#!/bin/bash
# Get the Syncthing device ID for this Mac

set -e

CONFIG_DIR="${paths.syncthingConfig}"

if [ -f "$CONFIG_DIR/cert.pem" ]; then
    DEVICE_ID=$(syncthing device-id --config="$CONFIG_DIR" 2>/dev/null || echo "")
fi

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

    // Create script in user's local bin
    const writeGetDeviceIdScript = runCommand({
        name: "get-device-id-script",
        create: `
            mkdir -p ~/.local/bin
            cat > ~/.local/bin/syncreeper-device-id << 'EOF'
${getDeviceIdScript}
EOF
            chmod 755 ~/.local/bin/syncreeper-device-id
            echo "Device ID script created at ~/.local/bin/syncreeper-device-id"
        `.trim(),
        dependsOn: [restartSyncthing],
    });
    resources.push(writeGetDeviceIdScript);

    // Verify Syncthing is running
    const verifySyncthing = runCommand({
        name: "verify-syncthing",
        create: `
            echo "Verifying Syncthing configuration..."
            brew services list | grep syncthing || echo "Syncthing service status unknown"
            echo ""
            echo "Device ID:"
            syncthing device-id --config="${paths.syncthingConfig}" 2>/dev/null || echo "Could not get device ID"
            echo ""
            echo "Syncthing configured successfully!"
            echo "Access GUI at: http://localhost:8384"
        `.trim(),
        dependsOn: [restartSyncthing],
    });
    resources.push(verifySyncthing);

    return { resources };
}
