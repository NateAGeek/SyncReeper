#!/usr/bin/env npx tsx
/**
 * Get the Syncthing device ID from a running VPS
 *
 * Run with: npm run get-device-id
 *
 * Options:
 *   --local  Run locally on the VPS instead of via SSH
 *   --help   Show help
 *
 * Examples:
 *   npm run get-device-id                    # Interactive, connects via SSH
 *   npm run get-device-id -- --local         # Run directly on the VPS
 *
 * Local Mode Access:
 *   - Linux: requires membership in 'syncreeper' group to read config
 *   - macOS: runs directly as current user
 */

import * as os from "node:os";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { input } from "@inquirer/prompts";
import { execa } from "execa";

interface Args {
    local: boolean;
}

async function parseArgs(): Promise<Args> {
    const argv = await yargs(hideBin(process.argv))
        .option("local", {
            type: "boolean",
            description: "Run locally on the VPS instead of via SSH",
            default: false,
        })
        .help()
        .alias("help", "h")
        .example("$0", "Interactive mode - prompts for VPS connection details")
        .example("$0 --local", "Run directly on the VPS (no SSH)")
        .parse();

    return {
        local: argv.local,
    };
}

/**
 * Get the path to the syncreeper-device-id script based on platform
 */
function getDeviceIdScriptPath(): string {
    if (process.platform === "darwin") {
        // macOS: installed in user's local bin
        return `${os.homedir()}/.local/bin/syncreeper-device-id`;
    }
    // Linux: installed in system bin
    return "/usr/local/bin/syncreeper-device-id";
}

async function main(): Promise<void> {
    const args = await parseArgs();

    console.log("\nGet Syncthing Device ID\n");

    if (args.local) {
        // Local execution - run directly on this machine
        console.log("Running locally...\n");

        const scriptPath = getDeviceIdScriptPath();

        try {
            // Try the script directly first (may be in PATH)
            const result = await execa("syncreeper-device-id", [], {
                stdio: "inherit",
            });
            process.exit(result.exitCode ?? 0);
        } catch {
            // If not in PATH, try the full path
            try {
                const result = await execa(scriptPath, [], {
                    stdio: "inherit",
                });
                process.exit(result.exitCode ?? 0);
            } catch {
                const platform = process.platform;
                console.error("\nFailed to get device ID. Make sure:");
                console.error("  1. SyncReeper has been deployed (pulumi up)");
                console.error("  2. Syncthing is running");
                if (platform === "darwin") {
                    console.error("  3. The syncreeper-device-id script exists in ~/.local/bin/");
                } else {
                    console.error("  3. The syncreeper-device-id script exists in /usr/local/bin/");
                    console.error("  4. You are in the 'syncreeper' group (run: groups)");
                }
                process.exit(1);
            }
        }
    } else {
        // Remote execution - connect via SSH
        const host = await input({
            message: "VPS hostname or IP:",
            validate: (v) => v.length > 0 || "Hostname is required",
        });

        const user = await input({
            message: "SSH username:",
            default: "syncreeper",
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
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
