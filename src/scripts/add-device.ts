#!/usr/bin/env npx tsx
/**
 * Add a device to Syncthing on the VPS
 *
 * Run with: npm run add-device
 *
 * Options:
 *   --local       Run locally on the VPS instead of via SSH
 *   --device-id   Syncthing device ID to add
 *   --name        Friendly name for the device (default: "remote-device")
 *   --folder      Folder ID to share (default: "repos")
 *   --help        Show help
 *
 * Examples:
 *   npm run add-device                                    # Fully interactive
 *   npm run add-device -- --local                         # Local, prompts for device info
 *   npm run add-device -- --local --device-id "ABC..."    # Local, partial args
 *   npm run add-device -- --local --device-id "ABC..." --name "Laptop" --folder repos  # Fully scripted
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { input } from "@inquirer/prompts";
import { execa } from "execa";

// Device ID format: 8 groups of 7 alphanumeric chars separated by dashes
const DEVICE_ID_REGEX =
    /^[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}$/;

interface Args {
    local: boolean;
    deviceId?: string;
    name?: string;
    folder?: string;
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
    };
}

function validateDeviceId(value: string): boolean | string {
    const normalized = value.toUpperCase().trim();
    if (!DEVICE_ID_REGEX.test(normalized)) {
        return "Invalid device ID format (expected: XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX)";
    }
    return true;
}

async function main(): Promise<void> {
    const args = await parseArgs();

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
            default: "syncreeper",
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

    const username = "syncreeper";

    // Commands to run
    const commands = [
        `echo "Adding device: ${deviceName} (${normalizedDeviceId})..."`,
        `sudo -u ${username} syncthing cli config devices add --device-id "${normalizedDeviceId}" --name "${deviceName}" 2>/dev/null || echo "Device may already exist"`,
        `echo "Sharing folder '${folderId}' with device..."`,
        `sudo -u ${username} syncthing cli config folders "${folderId}" devices add --device-id "${normalizedDeviceId}" 2>/dev/null || echo "Device may already be shared"`,
        `echo ""`,
        `echo "Done! Device added successfully."`,
        `echo "The remote device must also add this VPS to complete the connection."`,
        `echo "Run 'syncreeper-device-id' to get this VPS's device ID."`,
    ].join(" && ");

    if (args.local) {
        // Local execution
        console.log("Running locally...\n");

        try {
            const result = await execa("bash", ["-c", commands], {
                stdio: "inherit",
            });
            process.exit(result.exitCode ?? 0);
        } catch {
            console.error("\nFailed to add device. Make sure:");
            console.error("  1. SyncReeper has been deployed (pulumi up)");
            console.error("  2. Syncthing is running");
            console.error("  3. You have sudo access");
            process.exit(1);
        }
    } else {
        // Remote execution via SSH
        console.log(`\nConnecting to ${user}@${host}...\n`);

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
