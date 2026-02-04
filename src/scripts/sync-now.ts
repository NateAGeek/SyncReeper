#!/usr/bin/env npx tsx
/**
 * Trigger a manual sync on the VPS
 *
 * Run with: npm run sync-now
 *
 * Options:
 *   --local      Run locally on the VPS instead of via SSH
 *   --follow     Follow sync logs after starting
 *   --no-follow  Don't follow sync logs
 *   --help       Show help
 *
 * Examples:
 *   npm run sync-now                        # Interactive, connects via SSH
 *   npm run sync-now -- --local             # Local, prompts for follow logs
 *   npm run sync-now -- --local --follow    # Local, follow logs (no prompts)
 *   npm run sync-now -- --local --no-follow # Local, don't follow logs (no prompts)
 *
 * Local Mode (Linux):
 *   - Must be run as the 'syncreeper' user (uses user-level systemctl --user)
 *   - Or run via: sudo -u syncreeper npm run sync-now -- --local
 *
 * Local Mode (macOS):
 *   - Runs directly as current user via sync-repos script
 */

import * as os from "node:os";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { input, confirm } from "@inquirer/prompts";
import { execa } from "execa";

interface Args {
    local: boolean;
    follow?: boolean;
}

async function parseArgs(): Promise<Args> {
    const argv = await yargs(hideBin(process.argv))
        .option("local", {
            type: "boolean",
            description: "Run locally on the VPS instead of via SSH",
            default: false,
        })
        .option("follow", {
            type: "boolean",
            description: "Follow sync logs after starting (use --no-follow to disable)",
        })
        .help()
        .alias("help", "h")
        .example("$0", "Interactive mode - prompts for VPS connection details")
        .example("$0 --local", "Run directly on the VPS, prompts for follow logs")
        .example("$0 --local --follow", "Local execution, follow logs (fully scripted)")
        .example("$0 --local --no-follow", "Local execution, no logs (fully scripted)")
        .parse();

    return {
        local: argv.local,
        follow: argv.follow,
    };
}

/**
 * Run sync locally with platform-aware commands
 */
async function runLocalSync(followLogs: boolean): Promise<void> {
    const platform = process.platform;
    const username = os.userInfo().username;

    if (platform === "darwin") {
        // macOS: run the sync-repos script directly
        const homeDir = os.homedir();
        const syncCommand = followLogs
            ? `sync-repos && tail -50 "${homeDir}/Library/Logs/SyncReeper/sync.log"`
            : "sync-repos";

        try {
            const result = await execa("bash", ["-c", syncCommand], {
                stdio: "inherit",
            });
            console.log("\nSync triggered successfully!\n");
            process.exit(result.exitCode ?? 0);
        } catch {
            console.error("\nFailed to trigger sync. Make sure:");
            console.error("  1. SyncReeper has been deployed (pulumi up)");
            console.error("  2. The sync-repos script exists in ~/.local/bin/");
            process.exit(1);
        }
    } else {
        // Linux: use user-level systemctl (must be run as syncreeper)
        if (username !== "syncreeper") {
            console.error("\nOn Linux, this script must be run as the 'syncreeper' user.");
            console.error("");
            console.error("Options:");
            console.error("  1. Run as syncreeper user:");
            console.error("     sudo -u syncreeper npm run sync-now -- --local");
            console.error("");
            console.error("  2. Use SSH mode (without --local):");
            console.error("     npm run sync-now");
            process.exit(1);
        }

        // Running as syncreeper - use user-level systemctl
        const syncCommand = followLogs
            ? "systemctl --user start syncreeper-sync.service && journalctl --user -u syncreeper-sync -n 50 --no-pager"
            : "systemctl --user start syncreeper-sync.service";

        try {
            const result = await execa("bash", ["-c", syncCommand], {
                stdio: "inherit",
            });
            console.log("\nSync triggered successfully!\n");
            process.exit(result.exitCode ?? 0);
        } catch {
            console.error("\nFailed to trigger sync. Make sure:");
            console.error("  1. SyncReeper has been deployed (pulumi up)");
            console.error("  2. The sync service is installed");
            console.error("  3. User lingering is enabled (loginctl enable-linger syncreeper)");
            process.exit(1);
        }
    }
}

async function main(): Promise<void> {
    const args = await parseArgs();

    console.log("\nManual Repository Sync\n");

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

    // Get follow logs preference (from args or prompt)
    let followLogs: boolean;
    if (args.follow !== undefined) {
        followLogs = args.follow;
    } else {
        followLogs = await confirm({
            message: "Follow sync logs after starting?",
            default: true,
        });
    }

    if (args.local) {
        // Local execution with platform-aware logic
        console.log("Running locally...\n");
        await runLocalSync(followLogs);
    } else {
        // Remote execution via SSH
        // When SSH'ing as syncreeper user, the sync-repos script handles everything
        console.log(`\nConnecting to ${user}@${host}...\n`);

        // Build command for remote execution
        // sync-repos script will check if user is syncreeper and use systemctl --user
        const syncCommand = followLogs
            ? "sync-repos && journalctl --user -u syncreeper-sync -n 50 --no-pager"
            : "sync-repos";

        try {
            await execa("ssh", [`${user}@${host}`, syncCommand], {
                stdio: "inherit",
            });

            console.log("\nSync triggered successfully!\n");
        } catch {
            console.error("\nFailed to trigger sync. Make sure:");
            console.error("  1. The VPS is reachable via SSH");
            console.error("  2. SyncReeper has been deployed (pulumi up)");
            console.error("  3. The sync application is installed");
            process.exit(1);
        }
    }
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
