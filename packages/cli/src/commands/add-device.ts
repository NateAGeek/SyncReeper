/**
 * add-device command - Add a device to Syncthing
 *
 * Migrated from packages/host-utils/src/add-device.ts
 */

import * as os from "node:os";
import type { CommandModule } from "yargs";
import { input } from "@inquirer/prompts";
import { execa } from "execa";
import { resolveServiceUser } from "../utils/service-user.utils.js";

// Device ID format: 8 groups of 7 alphanumeric chars separated by dashes
const DEVICE_ID_REGEX =
    /^[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}$/;

function validateDeviceId(value: string): boolean | string {
    const normalized = value.toUpperCase().trim();
    if (!DEVICE_ID_REGEX.test(normalized)) {
        return "Invalid device ID format (expected: XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX)";
    }
    return true;
}

/**
 * Get the appropriate syncthing CLI command prefix based on platform and user
 */
function getSyncthingCliCommand(subCommand: string, serviceUser: string): string {
    const platform = process.platform;
    const username = os.userInfo().username;

    if (platform === "darwin") {
        return `syncthing cli ${subCommand}`;
    }

    if (username === serviceUser) {
        return `syncthing cli ${subCommand}`;
    } else if (username === "root") {
        return `sudo -u ${serviceUser} syncthing cli ${subCommand}`;
    } else {
        const syncthingConfig = `/home/${serviceUser}/.config/syncthing`;
        return `syncthing cli --config=${syncthingConfig} ${subCommand}`;
    }
}

export const addDeviceCommand: CommandModule = {
    command: "add-device",
    describe: "Add a device to Syncthing",
    builder: (yargs) =>
        yargs
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
            .example("$0 add-device", "Interactive mode - prompts for all values")
            .example("$0 add-device --local", "Run directly on the VPS, prompts for device info")
            .example(
                '$0 add-device --local --device-id "ABC..." --name "Laptop"',
                "Partially scripted"
            ),
    handler: async (argv) => {
        const serviceUser = await resolveServiceUser(argv.user as string | undefined);

        console.log("\nAdd Device to Syncthing\n");

        // Get SSH connection details (unless running locally)
        let host: string | undefined;
        let user: string | undefined;

        if (!argv.local) {
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
        let deviceId = argv.deviceId as string | undefined;
        if (!deviceId) {
            deviceId = await input({
                message: "Device ID to add:",
                validate: validateDeviceId,
                transformer: (v) => v.toUpperCase().trim(),
            });
        } else {
            const validation = validateDeviceId(deviceId);
            if (validation !== true) {
                console.error(`Error: ${validation}`);
                process.exit(1);
            }
        }
        const normalizedDeviceId = deviceId.toUpperCase().trim();

        // Get device name (from args or prompt)
        const deviceName =
            (argv.name as string | undefined) ??
            (await input({
                message: "Device name (optional):",
                default: "remote-device",
            }));

        // Get folder ID (from args or prompt)
        const folderId =
            (argv.folder as string | undefined) ??
            (await input({
                message: "Folder ID to share:",
                default: "repos",
            }));

        if (argv.local) {
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
                `echo "Run 'syncreeper get-device-id' to get this VPS's device ID."`,
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
                            `     Or run as: sudo -u ${serviceUser} syncreeper add-device --local`
                        );
                    }
                }
                process.exit(1);
            }
        } else {
            console.log(`\nConnecting to ${user}@${host}...\n`);

            const commands = [
                `echo "Adding device: ${deviceName} (${normalizedDeviceId})..."`,
                `syncthing cli config devices add --device-id "${normalizedDeviceId}" --name "${deviceName}" 2>/dev/null || echo "Device may already exist"`,
                `echo "Sharing folder '${folderId}' with device..."`,
                `syncthing cli config folders "${folderId}" devices add --device-id "${normalizedDeviceId}" 2>/dev/null || echo "Device may already be shared"`,
                `echo ""`,
                `echo "Done! Device added successfully."`,
                `echo "The remote device must also add this VPS to complete the connection."`,
                `echo "Run 'syncreeper get-device-id' to get this VPS's device ID."`,
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
    },
};
