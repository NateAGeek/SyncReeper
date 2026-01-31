#!/usr/bin/env npx tsx
/**
 * Add a device to Syncthing on the VPS
 *
 * Run with: npm run add-device
 *
 * This script SSHs into the VPS and adds a Syncthing device,
 * then shares the repos folder with it.
 */

import { input } from "@inquirer/prompts";
import { execa } from "execa";

// Device ID format: 8 groups of 7 alphanumeric chars separated by dashes
const DEVICE_ID_REGEX =
    /^[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}-[A-Z0-9]{7}$/;

async function main(): Promise<void> {
    console.log("\nAdd Device to Syncthing\n");

    const host = await input({
        message: "VPS hostname or IP:",
        validate: (v) => v.length > 0 || "Hostname is required",
    });

    const user = await input({
        message: "SSH username:",
        default: "root",
    });

    const deviceId = await input({
        message: "Device ID to add:",
        validate: (v) => {
            const normalized = v.toUpperCase().trim();
            if (!DEVICE_ID_REGEX.test(normalized)) {
                return "Invalid device ID format (expected: XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX)";
            }
            return true;
        },
        transformer: (v) => v.toUpperCase().trim(),
    });

    const deviceName = await input({
        message: "Device name (optional):",
        default: "remote-device",
    });

    const folderId = await input({
        message: "Folder ID to share:",
        default: "repos",
    });

    console.log(`\nConnecting to ${user}@${host}...\n`);

    const normalizedDeviceId = deviceId.toUpperCase().trim();
    const username = "syncreeper";

    // Commands to run on the VPS
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

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
