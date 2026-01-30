#!/usr/bin/env npx tsx
/**
 * Get the Syncthing device ID from a running VPS
 *
 * Run with: npm run get-device-id
 *
 * This script SSHs into the VPS and retrieves the Syncthing device ID.
 * Share this ID with other devices to connect them.
 */

import { input } from "@inquirer/prompts";
import { execa } from "execa";

async function main(): Promise<void> {
    console.log("\n📡 Get Syncthing Device ID\n");

    const host = await input({
        message: "VPS hostname or IP:",
        validate: (v) => v.length > 0 || "Hostname is required",
    });

    const user = await input({
        message: "SSH username:",
        default: "root",
    });

    console.log(`\nConnecting to ${user}@${host}...\n`);

    try {
        const result = await execa("ssh", [`${user}@${host}`, "syncreeper-device-id"], {
            stdio: "inherit",
        });

        process.exit(result.exitCode ?? 0);
    } catch {
        console.error("\nFailed to get device ID. Make sure:");
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
