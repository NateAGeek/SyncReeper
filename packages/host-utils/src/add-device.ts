#!/usr/bin/env npx tsx
/**
 * Add a device to Syncthing on the VPS
 *
 * Run with: pnpm run add-device
 *
 * Options:
 *   --local       Run locally on the VPS instead of via SSH
 *   --device-id   Syncthing device ID to add
 *   --name        Friendly name for the device (default: "remote-device")
 *   --folder      Folder ID to share (default: "repos")
 *   --user        Service username (default: reads from Pulumi config or "syncreeper")
 *   --help        Show help
 *
 * Examples:
 *   pnpm run add-device                                    # Fully interactive
 *   pnpm run add-device -- --local                         # Local, prompts for device info
 *   pnpm run add-device -- --local --device-id "ABC..."    # Local, partial args
 *   pnpm run add-device -- --local --device-id "ABC..." --name "Laptop" --folder repos  # Fully scripted
 *   pnpm run add-device -- --user myuser                   # Use custom service username
 *
 * Local Mode Access (Linux):
 *   - As the service user: runs directly
 *   - As root: uses sudo -u <service-user>
 *   - As other user: requires membership in service user's group
 *
 * Local Mode Access (macOS):
 *   - Runs directly as current user
 */

import * as os from "node:os";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { input } from "@inquirer/prompts";
import { execa } from "execa";
import { DEFAULT_SERVICE_USER_LINUX } from "@syncreeper/shared";

// Device ID format: 8 groups of 7 alphanumeric chars separated by dashes
const DEVICE_ID_REGEX =
    /^[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}$/;

/**
 * Get the default service username from Pulumi config, falling back to platform defaults
 */
async function getDefaultServiceUser(): Promise<string> {
    try {
        const result = await execa("pulumi", ["config", "get", "syncreeper:service-user"], {
            reject: false,
        });
        if (result.exitCode === 0 && result.stdout.trim()) {
            return result.stdout.trim();
        }
    } catch {
        // Ignore errors - fall through to defaults
    }

    if (process.platform === "darwin") {
        return os.userInfo().username;
    }
    return DEFAULT_SERVICE_USER_LINUX;
}

interface Args {
    local: boolean;
    deviceId?: string;
    name?: string;
    folder?: string;
    user?: string;
}

async function parseArgs(): Promise<Args> {
    const argv = await yargs(hideBin(process.argv))
        .option("local", {
            type: "boolean",
            description: "Run locally on the VPS instead of via SSH",
            default: false,
        })
        .option("device-id", {
            type: "string",
            description: "Syncthing device ID to add",
        })
        .option("name", {
            type: "string",
            description: "Friendly name for the device",
        })
        .option("folder", {
            type: "string",
            description: "Folder ID to share with the device",
        })
        .option("user", {
            type: "string",
            description: "Service username (default: from Pulumi config or 'syncreeper')",
        })
        .help()
        .alias("help", "h")
        .example("$0", "Interactive mode - prompts for all values")
        .example("$0 --local", "Run directly on the VPS, prompts for device info")
        .example('$0 --local --device-id "ABC..." --name "Laptop"', "Partially scripted")
        .parse();

    return {
        local: argv.local,
        deviceId: argv.deviceId,
        name: argv.name,
        folder: argv.folder,
        user: argv.user,
    };
}

function validateDeviceId(value: string): boolean | string {
    const normalized = value.toUpperCase().trim();
    if (!DEVICE_ID_REGEX.test(normalized)) {
        return "Invalid device ID format (expected: XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX)";
    }
    return true;
}

/**
 * Get the appropriate syncthing CLI command prefix based on platform and user
 *
 * - macOS: run directly (no prefix needed)
 * - Linux as the service user: run directly
 * - Linux as root: use sudo -u <service-user>
 * - Linux as other user: run with explicit --config flag (requires group membership)
 */
function getSyncthingCliCommand(subCommand: string, serviceUser: string): string {
    const platform = process.platform;
    const username = os.userInfo().username;

    if (platform === "darwin") {
        // macOS: always run directly
        return `syncthing cli ${subCommand}`;
    }

    // Linux
    if (username === serviceUser) {
        // Running as service user - run directly
        return `syncthing cli ${subCommand}`;
    } else if (username === "root") {
        // Running as root - use sudo to run as service user
        return `sudo -u ${serviceUser} syncthing cli ${subCommand}`;
    } else {
        // Other user - use explicit config path (requires group membership)
        const syncthingConfig = `/home/${serviceUser}/.config/syncthing`;
        return `syncthing cli --config=${syncthingConfig} ${subCommand}`;
    }
}

async function main(): Promise<void> {
    const args = await parseArgs();
    const serviceUser = args.user ?? (await getDefaultServiceUser());

    console.log("\nAdd Device to Syncthing\n");

    // Get SSH connection details (unless running locally)
    let host: string | undefined;
    let user: string | undefined;

    if (!args.local) {
        host = await input({
            message: "VPS hostname or IP:",
            validate: (v) => v.length > 0 || "Hostname is required",
        });

        user = await input({
            message: "SSH username:",
            default: serviceUser,
        });
    }

    // Get device ID (from args or prompt)
    let deviceId = args.deviceId;
    if (!deviceId) {
        deviceId = await input({
            message: "Device ID to add:",
            validate: validateDeviceId,
            transformer: (v) => v.toUpperCase().trim(),
        });
    } else {
        // Validate CLI-provided device ID
        const validation = validateDeviceId(deviceId);
        if (validation !== true) {
            console.error(`Error: ${validation}`);
            process.exit(1);
        }
    }
    const normalizedDeviceId = deviceId.toUpperCase().trim();

    // Get device name (from args or prompt)
    const deviceName =
        args.name ??
        (await input({
            message: "Device name (optional):",
            default: "remote-device",
        }));

    // Get folder ID (from args or prompt)
    const folderId =
        args.folder ??
        (await input({
            message: "Folder ID to share:",
            default: "repos",
        }));

    if (args.local) {
        // Local execution - build platform-aware commands
        console.log("Running locally...\n");

        const addDeviceCmd = getSyncthingCliCommand(
            `config devices add --device-id "${normalizedDeviceId}" --name "${deviceName}"`,
            serviceUser
        );
        const shareFolderCmd = getSyncthingCliCommand(
            `config folders "${folderId}" devices add --device-id "${normalizedDeviceId}"`,
            serviceUser
        );

        const commands = [
            `echo "Adding device: ${deviceName} (${normalizedDeviceId})..."`,
            `${addDeviceCmd} 2>/dev/null || echo "Device may already exist"`,
            `echo "Sharing folder '${folderId}' with device..."`,
            `${shareFolderCmd} 2>/dev/null || echo "Device may already be shared"`,
            `echo ""`,
            `echo "Done! Device added successfully."`,
            `echo "The remote device must also add this VPS to complete the connection."`,
            `echo "Run 'syncreeper-device-id' to get this VPS's device ID."`,
        ].join(" && ");

        try {
            const result = await execa("bash", ["-c", commands], {
                stdio: "inherit",
            });
            process.exit(result.exitCode ?? 0);
        } catch {
            const platform = process.platform;
            console.error("\nFailed to add device. Make sure:");
            console.error("  1. SyncReeper has been deployed (pulumi up)");
            console.error("  2. Syncthing is running");
            if (platform === "linux") {
                const username = os.userInfo().username;
                if (username !== serviceUser && username !== "root") {
                    console.error(`  3. You are in the '${serviceUser}' group (run: groups)`);
                    console.error(
                        `     Or run as: sudo -u ${serviceUser} pnpm run add-device -- --local`
                    );
                }
            }
            process.exit(1);
        }
    } else {
        // Remote execution via SSH
        // When SSH'ing as the service user, run syncthing cli directly
        console.log(`\nConnecting to ${user}@${host}...\n`);

        const commands = [
            `echo "Adding device: ${deviceName} (${normalizedDeviceId})..."`,
            `syncthing cli config devices add --device-id "${normalizedDeviceId}" --name "${deviceName}" 2>/dev/null || echo "Device may already exist"`,
            `echo "Sharing folder '${folderId}' with device..."`,
            `syncthing cli config folders "${folderId}" devices add --device-id "${normalizedDeviceId}" 2>/dev/null || echo "Device may already be shared"`,
            `echo ""`,
            `echo "Done! Device added successfully."`,
            `echo "The remote device must also add this VPS to complete the connection."`,
            `echo "Run 'syncreeper-device-id' to get this VPS's device ID."`,
        ].join(" && ");

        try {
            const result = await execa("ssh", [`${user}@${host}`, commands], {
                stdio: "inherit",
            });
            process.exit(result.exitCode ?? 0);
        } catch {
            console.error("\nFailed to add device. Make sure:");
            console.error("  1. The VPS is reachable via SSH");
            console.error("  2. SyncReeper has been deployed (pulumi up)");
            console.error("  3. Syncthing is running");
            process.exit(1);
        }
    }
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
