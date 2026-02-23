/**
 * sync-now command - Trigger a manual repository sync
 *
 * Migrated from packages/host-utils/src/sync-now.ts
 */

import * as os from "node:os";
import type { CommandModule } from "yargs";
import { input, confirm } from "@inquirer/prompts";
import { execa } from "execa";
import { resolveServiceUser } from "../utils/service-user.utils.js";

/**
 * Run sync locally with platform-aware commands
 */
async function runLocalSync(followLogs: boolean, serviceUser: string): Promise<void> {
    const platform = process.platform;
    const username = os.userInfo().username;

    if (platform === "darwin") {
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
        if (username !== serviceUser) {
            console.error(`\nOn Linux, this script must be run as the '${serviceUser}' user.`);
            console.error("");
            console.error("Options:");
            console.error(`  1. Run as ${serviceUser} user:`);
            console.error(`     sudo -u ${serviceUser} syncreeper sync-now --local`);
            console.error("");
            console.error("  2. Use SSH mode (without --local):");
            console.error("     syncreeper sync-now");
            process.exit(1);
        }

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
            console.error(`  3. User lingering is enabled (loginctl enable-linger ${serviceUser})`);
            process.exit(1);
        }
    }
}

export const syncNowCommand: CommandModule = {
    command: "sync-now",
    describe: "Trigger a manual repository sync",
    builder: (yargs) =>
        yargs
            .option("local", {
                type: "boolean",
                description: "Run locally on the VPS instead of via SSH",
                default: false,
            })
            .option("follow", {
                type: "boolean",
                description: "Follow sync logs after starting (use --no-follow to disable)",
            })
            .option("user", {
                type: "string",
                description: "Service username (default: from Pulumi config or 'syncreeper')",
            })
            .example("$0 sync-now", "Interactive mode - prompts for VPS connection details")
            .example("$0 sync-now --local", "Run directly on the VPS, prompts for follow logs")
            .example("$0 sync-now --local --follow", "Local execution, follow logs")
            .example("$0 sync-now --local --no-follow", "Local execution, no logs"),
    handler: async (argv) => {
        const serviceUser = await resolveServiceUser(argv.user as string | undefined);

        console.log("\nManual Repository Sync\n");

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

        // Get follow logs preference (from args or prompt)
        let followLogs: boolean;
        if (argv.follow !== undefined) {
            followLogs = argv.follow as boolean;
        } else {
            followLogs = await confirm({
                message: "Follow sync logs after starting?",
                default: true,
            });
        }

        if (argv.local) {
            console.log("Running locally...\n");
            await runLocalSync(followLogs, serviceUser);
        } else {
            console.log(`\nConnecting to ${user}@${host}...\n`);

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
    },
};
