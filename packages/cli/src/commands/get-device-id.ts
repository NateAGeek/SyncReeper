/**
 * get-device-id command - Get the Syncthing device ID
 *
 * Migrated from packages/host-utils/src/get-device-id.ts
 */

import * as os from "node:os";
import type { CommandModule } from "yargs";
import { input } from "@inquirer/prompts";
import { execa } from "execa";
import { resolveServiceUser } from "../utils/service-user.utils.js";

/**
 * Get the path to the syncreeper-device-id script based on platform
 */
function getDeviceIdScriptPath(): string {
    if (process.platform === "darwin") {
        return `${os.homedir()}/.local/bin/syncreeper-device-id`;
    }
    return "/usr/local/bin/syncreeper-device-id";
}

export const getDeviceIdCommand: CommandModule = {
    command: "get-device-id",
    describe: "Get the Syncthing device ID",
    builder: (yargs) =>
        yargs
            .option("local", {
                type: "boolean",
                description: "Run locally on the VPS instead of via SSH",
                default: false,
            })
            .option("user", {
                type: "string",
                description: "Service username (default: from Pulumi config or 'syncreeper')",
            })
            .example("$0 get-device-id", "Interactive mode - prompts for VPS connection details")
            .example("$0 get-device-id --local", "Run directly on the VPS (no SSH)"),
    handler: async (argv) => {
        const serviceUser = await resolveServiceUser(argv.user as string | undefined);

        console.log("\nGet Syncthing Device ID\n");

        if (argv.local) {
            console.log("Running locally...\n");

            const scriptPath = getDeviceIdScriptPath();

            try {
                const result = await execa("syncreeper-device-id", [], {
                    stdio: "inherit",
                });
                process.exit(result.exitCode ?? 0);
            } catch {
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
                        console.error(
                            "  3. The syncreeper-device-id script exists in ~/.local/bin/"
                        );
                    } else {
                        console.error(
                            "  3. The syncreeper-device-id script exists in /usr/local/bin/"
                        );
                        console.error(`  4. You are in the '${serviceUser}' group (run: groups)`);
                    }
                    process.exit(1);
                }
            }
        } else {
            const host = await input({
                message: "VPS hostname or IP:",
                validate: (v) => v.length > 0 || "Hostname is required",
            });

            const user = await input({
                message: "SSH username:",
                default: serviceUser,
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
    },
};
