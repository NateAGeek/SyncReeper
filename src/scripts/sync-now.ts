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
 */

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

    // Build command based on follow preference
    const syncCommand = followLogs
        ? "sync-repos && journalctl -u syncreeper-sync -n 50 --no-pager"
        : "sync-repos";

    if (args.local) {
        // Local execution
        console.log("Running locally...\n");

        try {
            const result = await execa("bash", ["-c", syncCommand], {
                stdio: "inherit",
            });

            console.log("\nSync triggered successfully!\n");
            process.exit(result.exitCode ?? 0);
        } catch {
            console.error("\nFailed to trigger sync. Make sure:");
            console.error("  1. SyncReeper has been deployed (pulumi up)");
            console.error("  2. The sync-repos script exists in /usr/local/bin/");
            console.error("  3. You have sudo access");
            process.exit(1);
        }
    } else {
        // Remote execution via SSH
        console.log(`\nConnecting to ${user}@${host}...\n`);

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
