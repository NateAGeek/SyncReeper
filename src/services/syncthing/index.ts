/**
 * Syncthing Service
 *
 * Installs and configures Syncthing to sync repositories across devices.
 * Syncthing runs as the syncreeper user and communicates via relay servers.
 * The GUI is only accessible via SSH tunnel.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand, writeFile, enableService } from "../../lib/command.js";
import { PATHS, SERVICE_USER } from "../../config/types.js";
import type { SyncReeperConfig } from "../../config/types.js";
import { generateSyncthingConfig, type SyncthingDevice } from "./config.js";

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
 * Sets up Syncthing for repository synchronization
 * - Installs Syncthing from official APT repository
 * - Generates config.xml with trusted devices
 * - Runs as syncreeper user
 * - Only listens on localhost (access via SSH tunnel)
 */
export function setupSyncthing(options: SetupSyncthingOptions): SetupSyncthingResult {
    const { config, dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];
    const { name: username } = SERVICE_USER;

    // Add Syncthing APT repository and install
    const installSyncthing = runCommand({
        name: "install-syncthing",
        create: `
            # Add Syncthing release PGP keys
            mkdir -p /etc/apt/keyrings
            curl -fsSL https://syncthing.net/release-key.gpg | gpg --dearmor -o /etc/apt/keyrings/syncthing.gpg
            
            # Add the stable channel
            echo "deb [signed-by=/etc/apt/keyrings/syncthing.gpg] https://apt.syncthing.net/ syncthing stable" | tee /etc/apt/sources.list.d/syncthing.list
            
            # Install
            apt-get update
            apt-get install -y syncthing
            
            syncthing --version
        `.trim(),
        delete: `
            apt-get remove -y syncthing || true
            rm -f /etc/apt/sources.list.d/syncthing.list
            rm -f /etc/apt/keyrings/syncthing.gpg
        `.trim(),
        dependsOn,
    });
    resources.push(installSyncthing);

    // Create Syncthing config directory
    const createConfigDir = runCommand({
        name: "syncthing-config-dir",
        create: `
            mkdir -p ${PATHS.syncthingConfig}
            chown ${username}:${username} ${PATHS.syncthingConfig}
            chmod 700 ${PATHS.syncthingConfig}
        `.trim(),
        dependsOn: [installSyncthing],
    });
    resources.push(createConfigDir);

    // Generate Syncthing config.xml
    const devices: SyncthingDevice[] = config.syncthing.trustedDevices.map((id, index) => ({
        id,
        name: `Device-${index + 1}`,
    }));

    const syncthingConfigXml = generateSyncthingConfig({
        apiKey: config.syncthing.apiKey,
        devices,
        folderPath: config.sync.reposPath,
        folderId: "repos",
        folderLabel: "GitHub Repositories",
    });

    const writeConfig = writeFile({
        name: "syncthing-config",
        path: `${PATHS.syncthingConfig}/config.xml`,
        content: syncthingConfigXml,
        mode: "600",
        owner: username,
        group: username,
        dependsOn: [createConfigDir],
    });
    resources.push(writeConfig);

    // Create systemd service override
    const createOverrideDir = runCommand({
        name: "syncthing-override-dir",
        create: `
            mkdir -p /etc/systemd/system/syncthing@${username}.service.d
        `.trim(),
        delete: `rm -rf /etc/systemd/system/syncthing@${username}.service.d`,
        dependsOn: [installSyncthing],
    });
    resources.push(createOverrideDir);

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
        dependsOn: [writeConfig, writeOverride],
    });
    resources.push(enableSyncthing);

    // Create convenience script to get device ID
    const getDeviceIdScript = `#!/bin/bash
# Get the Syncthing device ID for this VPS
# Share this ID with other devices to allow them to connect

CONFIG_FILE="${PATHS.syncthingConfig}/config.xml"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Syncthing config not found. Is Syncthing running?"
    exit 1
fi

# Extract device ID from config
DEVICE_ID=$(grep -oP '(?<=<device id=")[^"]+' "$CONFIG_FILE" | head -1)

if [ -z "$DEVICE_ID" ]; then
    # If no device in config yet, generate from syncthing
    DEVICE_ID=$(sudo -u ${username} syncthing --device-id 2>/dev/null)
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
        dependsOn: [enableSyncthing],
    });
    resources.push(writeGetDeviceIdScript);

    // Verify Syncthing is running
    const verifySyncthing = runCommand({
        name: "verify-syncthing",
        create: `
            sleep 2
            systemctl status syncthing@${username} --no-pager || true
            echo "Syncthing configured successfully"
            echo "Access GUI via SSH tunnel: ssh -L 8384:localhost:8384 your-vps"
        `.trim(),
        dependsOn: [enableSyncthing],
    });
    resources.push(verifySyncthing);

    return { resources };
}

export {
    generateSyncthingConfig,
    type SyncthingDevice,
    type SyncthingConfigOptions,
} from "./config.js";
