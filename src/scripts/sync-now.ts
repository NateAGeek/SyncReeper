#!/usr/bin/env npx tsx
/**
 * Trigger a manual sync on the VPS
 *
 * Run with: npm run sync-now
 *
 * This script SSHs into the VPS and triggers an immediate repository sync.
 */

import { input, confirm } from "@inquirer/prompts";
import { execa } from "execa";

async function main(): Promise<void> {
    console.log("\n🔄 Manual Repository Sync\n");

    const host = await input({
        message: "VPS hostname or IP:",
        validate: (v) => v.length > 0 || "Hostname is required",
    });

    const user = await input({
        message: "SSH username:",
        default: "root",
    });

    const followLogs = await confirm({
        message: "Follow sync logs after starting?",
        default: true,
    });

    console.log(`\nConnecting to ${user}@${host}...\n`);

    try {
        if (followLogs) {
            // Start sync and follow logs
            await execa(
                "ssh",
                [`${user}@${host}`, "sync-repos && journalctl -u syncreeper-sync -n 50 --no-pager"],
                { stdio: "inherit" }
            );
        } else {
            // Just start sync
            await execa("ssh", [`${user}@${host}`, "sync-repos"], { stdio: "inherit" });
        }

        console.log("\n✅ Sync triggered successfully!\n");
    } catch {
        console.error("\nFailed to trigger sync. Make sure:");
        console.error("  1. The VPS is reachable via SSH");
        console.error("  2. SyncReeper has been deployed (pulumi up)");
        console.error("  3. The sync application is installed");
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
