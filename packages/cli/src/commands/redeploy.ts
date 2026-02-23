/**
 * redeploy command - Redeploy the sync bundle without full pulumi up
 *
 * Migrated from packages/host-utils/src/redeploy.ts
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { CommandModule } from "yargs";
import { input } from "@inquirer/prompts";
import { execa } from "execa";
import { resolveServiceUser } from "../utils/service-user.utils.js";

/**
 * Resolve the project root by walking up from this script's location.
 *
 * This file lives at <root>/packages/cli/src/commands/redeploy.ts,
 * so the project root is 4 levels up from the directory containing this file.
 */
function getProjectRoot(): string {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(__dirname, "..", "..", "..", "..");
}

function getSyncBundlePath(): string {
    return path.join(getProjectRoot(), "packages", "sync", "dist", "bundle.js");
}

function getTargetBundlePath(platform: string, serviceUser: string): string {
    if (platform === "darwin") {
        const home =
            serviceUser === os.userInfo().username ? os.homedir() : `/Users/${serviceUser}`;
        return path.join(
            home,
            "Library",
            "Application Support",
            "SyncReeper",
            "sync",
            "dist",
            "bundle.js"
        );
    }

    const home = `/home/${serviceUser}`;
    return `${home}/.config/syncreeper/sync/dist/bundle.js`;
}

async function buildSyncBundle(): Promise<void> {
    console.log("Building sync bundle...\n");

    const projectRoot = getProjectRoot();
    try {
        await execa("pnpm", ["run", "build:sync"], {
            cwd: projectRoot,
            stdio: "inherit",
        });
        console.log("\nSync bundle built successfully.\n");
    } catch {
        console.error("\nFailed to build sync bundle.");
        console.error("Make sure you are in the project root and dependencies are installed.");
        process.exit(1);
    }
}

async function restartLinux(serviceUser: string, currentUser: string): Promise<void> {
    console.log("Restarting sync service...");

    if (currentUser === serviceUser) {
        try {
            await execa("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
            await execa("systemctl", ["--user", "restart", "syncreeper-sync.timer"], {
                stdio: "inherit",
            });
            console.log("Sync timer restarted.");
        } catch {
            console.error("Failed to restart sync timer.");
            console.error("Check: systemctl --user status syncreeper-sync.timer");
            process.exit(1);
        }
    } else if (currentUser === "root") {
        const uid = (await execa("id", ["-u", serviceUser])).stdout.trim();
        const runtimeDir = `/run/user/${uid}`;

        try {
            await execa(
                "sudo",
                [
                    "-u",
                    serviceUser,
                    `XDG_RUNTIME_DIR=${runtimeDir}`,
                    `DBUS_SESSION_BUS_ADDRESS=unix:path=${runtimeDir}/bus`,
                    "systemctl",
                    "--user",
                    "daemon-reload",
                ],
                { stdio: "inherit" }
            );
            await execa(
                "sudo",
                [
                    "-u",
                    serviceUser,
                    `XDG_RUNTIME_DIR=${runtimeDir}`,
                    `DBUS_SESSION_BUS_ADDRESS=unix:path=${runtimeDir}/bus`,
                    "systemctl",
                    "--user",
                    "restart",
                    "syncreeper-sync.timer",
                ],
                { stdio: "inherit" }
            );
            console.log("Sync timer restarted.");
        } catch {
            console.error("Failed to restart sync timer.");
            console.error(
                `Check: sudo -u ${serviceUser} systemctl --user status syncreeper-sync.timer`
            );
            process.exit(1);
        }
    } else {
        console.error(
            `\nCannot restart service: running as '${currentUser}', not '${serviceUser}'.`
        );
        console.error("");
        console.error("Options:");
        console.error(`  1. Run as root: sudo syncreeper redeploy --local`);
        console.error(
            `  2. Run as the service user: sudo -u ${serviceUser} syncreeper redeploy --local`
        );
        console.error(`  3. Skip restart: syncreeper redeploy --local --no-restart`);
        process.exit(1);
    }
}

async function restartDarwin(serviceUser: string): Promise<void> {
    console.log("Restarting sync service...");

    const plistName = "com.syncreeper.sync";

    try {
        const result = await execa("launchctl", ["list", plistName], { reject: false });
        if (result.exitCode === 0) {
            const home =
                serviceUser === os.userInfo().username ? os.homedir() : `/Users/${serviceUser}`;
            const plistPath = path.join(home, "Library", "LaunchAgents", `${plistName}.plist`);

            await execa("launchctl", ["unload", plistPath], { reject: false });
            await execa("launchctl", ["load", plistPath]);
            console.log("Sync agent reloaded.");
        } else {
            console.log(
                "Sync agent is not currently loaded. The new bundle will be used on next load."
            );
        }
    } catch {
        console.error("Failed to restart sync agent.");
        console.error("Check: launchctl list | grep syncreeper");
        process.exit(1);
    }
}

async function deployLocal(
    serviceUser: string,
    shouldBuild: boolean,
    shouldRestart: boolean
): Promise<void> {
    const platform = process.platform;
    const username = os.userInfo().username;

    if (shouldBuild) {
        await buildSyncBundle();
    }

    const bundlePath = getSyncBundlePath();
    if (!fs.existsSync(bundlePath)) {
        console.error(`Bundle not found at ${bundlePath}`);
        console.error("Run with --build (default) or build manually: pnpm run build:sync");
        process.exit(1);
    }

    const targetPath = getTargetBundlePath(platform, serviceUser);
    const targetDir = path.dirname(targetPath);

    if (!fs.existsSync(targetDir)) {
        console.error(`Target directory does not exist: ${targetDir}`);
        console.error("Has SyncReeper been deployed with 'pulumi up' at least once?");
        process.exit(1);
    }

    console.log(`Copying bundle to ${targetPath}...`);
    try {
        fs.copyFileSync(bundlePath, targetPath);
        console.log("Bundle copied successfully.");
    } catch (err) {
        console.error(`Failed to copy bundle: ${err}`);
        console.error(`\nIf this is a permissions issue, try running as root or the service user:`);
        console.error(`  sudo syncreeper redeploy --local --user ${serviceUser}`);
        process.exit(1);
    }

    console.log("Verifying bundle...");
    try {
        await execa("node", ["--check", targetPath]);
        console.log("Bundle verified (valid JavaScript).\n");
    } catch {
        console.error("Bundle verification failed! The deployed file is not valid JavaScript.");
        console.error("This should not happen - the build may be corrupted.");
        process.exit(1);
    }

    if (shouldRestart) {
        if (platform === "darwin") {
            await restartDarwin(serviceUser);
        } else {
            await restartLinux(serviceUser, username);
        }
    } else {
        console.log("Skipping service restart (--no-restart).");
        console.log("The new bundle will take effect on the next scheduled sync.");
    }

    console.log("\nRedeploy complete!\n");
}

async function deployRemote(
    host: string,
    sshUser: string,
    serviceUser: string,
    shouldBuild: boolean,
    shouldRestart: boolean
): Promise<void> {
    if (shouldBuild) {
        await buildSyncBundle();
    }

    const bundlePath = getSyncBundlePath();
    if (!fs.existsSync(bundlePath)) {
        console.error(`Bundle not found at ${bundlePath}`);
        console.error("Run with --build (default) or build manually: pnpm run build:sync");
        process.exit(1);
    }

    const targetPath = getTargetBundlePath("linux", serviceUser);

    console.log(`Copying bundle to ${sshUser}@${host}:${targetPath}...`);
    try {
        await execa("scp", [bundlePath, `${sshUser}@${host}:${targetPath}`], {
            stdio: "inherit",
        });
        console.log("Bundle copied successfully.");
    } catch {
        console.error("\nFailed to copy bundle via scp. Make sure:");
        console.error("  1. The VPS is reachable via SSH");
        console.error("  2. SyncReeper has been deployed at least once (pulumi up)");
        console.error(`  3. The user '${sshUser}' has write access to ${targetPath}`);
        process.exit(1);
    }

    console.log("Verifying bundle on remote...");
    try {
        await execa("ssh", [`${sshUser}@${host}`, `node --check ${targetPath}`], {
            stdio: "inherit",
        });
        console.log("Bundle verified (valid JavaScript).\n");
    } catch {
        console.error("Bundle verification failed on remote! The file may be corrupted.");
        process.exit(1);
    }

    if (shouldRestart) {
        console.log("Restarting sync service on remote...");

        const restartCmd = [
            `UID_VAL=$(id -u ${serviceUser})`,
            `export XDG_RUNTIME_DIR=/run/user/$UID_VAL`,
            `export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$UID_VAL/bus`,
            "systemctl --user daemon-reload",
            "systemctl --user restart syncreeper-sync.timer",
            'echo "Sync timer restarted."',
        ].join(" && ");

        const remoteCmd =
            sshUser === serviceUser ? restartCmd : `sudo -u ${serviceUser} bash -c '${restartCmd}'`;

        try {
            await execa("ssh", [`${sshUser}@${host}`, remoteCmd], {
                stdio: "inherit",
            });
        } catch {
            console.error("Failed to restart sync service on remote.");
            console.error("You may need to restart it manually:");
            console.error(
                `  ssh ${sshUser}@${host} 'systemctl --user restart syncreeper-sync.timer'`
            );
            process.exit(1);
        }
    } else {
        console.log("Skipping service restart (--no-restart).");
        console.log("The new bundle will take effect on the next scheduled sync.");
    }

    console.log("\nRedeploy complete!\n");
}

export const redeployCommand: CommandModule = {
    command: "redeploy",
    describe: "Redeploy the sync bundle without full pulumi up",
    builder: (yargs) =>
        yargs
            .option("local", {
                type: "boolean",
                description: "Run locally on the target machine instead of via SSH",
                default: false,
            })
            .option("build", {
                type: "boolean",
                description: "Build the sync bundle before deploying (use --no-build to skip)",
                default: true,
            })
            .option("restart", {
                type: "boolean",
                description: "Restart the sync service after deploying (use --no-restart to skip)",
                default: true,
            })
            .option("user", {
                type: "string",
                description: "Service username (default: from Pulumi config or 'syncreeper')",
            })
            .example("$0 redeploy", "Interactive mode - prompts for VPS connection details")
            .example("$0 redeploy --local", "Build, deploy, and restart locally")
            .example("$0 redeploy --local --no-build", "Deploy existing bundle without rebuilding")
            .example(
                "$0 redeploy --local --no-restart",
                "Build and deploy without restarting the service"
            ),
    handler: async (argv) => {
        const serviceUser = await resolveServiceUser(argv.user as string | undefined);
        const shouldBuild = argv.build as boolean;
        const shouldRestart = argv.restart as boolean;

        console.log("\nSyncReeper Redeploy\n");

        if (argv.local) {
            console.log(
                `Mode: Local | User: ${serviceUser} | Build: ${shouldBuild} | Restart: ${shouldRestart}\n`
            );
            await deployLocal(serviceUser, shouldBuild, shouldRestart);
        } else {
            const host = await input({
                message: "VPS hostname or IP:",
                validate: (v) => v.length > 0 || "Hostname is required",
            });

            const sshUser = await input({
                message: "SSH username:",
                default: serviceUser,
            });

            console.log(
                `\nMode: SSH | Host: ${sshUser}@${host} | User: ${serviceUser} | Build: ${shouldBuild} | Restart: ${shouldRestart}\n`
            );
            await deployRemote(host, sshUser, serviceUser, shouldBuild, shouldRestart);
        }
    },
};
