#!/usr/bin/env npx tsx
/**
 * Redeploy the sync bundle without a full `pulumi up`
 *
 * Rebuilds the sync package, copies the bundle to the target location,
 * verifies it, and restarts the sync service.
 *
 * Run with: pnpm run redeploy
 *
 * Options:
 *   --local        Run locally on the target machine instead of via SSH
 *   --build        Build the sync bundle before deploying (default: true)
 *   --no-build     Skip the build step (use existing bundle)
 *   --restart      Restart the sync service after deploying (default: true)
 *   --no-restart   Don't restart the sync service
 *   --user         Service username (default: reads from Pulumi config or "syncreeper")
 *   --help         Show help
 *
 * Examples:
 *   pnpm run redeploy                          # Interactive, connects via SSH
 *   pnpm run redeploy -- --local               # Local, build + deploy + restart
 *   pnpm run redeploy -- --local --no-build    # Local, deploy existing bundle + restart
 *   pnpm run redeploy -- --local --no-restart  # Local, build + deploy, skip restart
 *   pnpm run redeploy -- --user myuser         # Use custom service username
 *
 * Local Mode (Linux):
 *   - Must be run as root or the service user
 *   - The bundle is copied to ~/.config/syncreeper/sync/dist/bundle.js
 *   - The user-level systemd service is restarted
 *
 * Local Mode (macOS):
 *   - Runs as the current user
 *   - The bundle is copied to ~/Library/Application Support/SyncReeper/sync/dist/bundle.js
 *   - The launchd sync agent is restarted (if running)
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { input } from "@inquirer/prompts";
import { execa } from "execa";
import { DEFAULT_SERVICE_USER_LINUX } from "@syncreeper/shared";

/**
 * Get the default service username from Pulumi config, falling back to platform defaults
 */
async function getDefaultServiceUser(): Promise<string> {
    try {
        const result = await execa("pulumi", ["config", "get", "syncreeper:service-user"], {
            reject: false,
        });
        if (result.exitCode === 0 && result.stdout.trim()) {
            return result.stdout.trim();
        }
    } catch {
        // Ignore errors - fall through to defaults
    }

    if (process.platform === "darwin") {
        return os.userInfo().username;
    }
    return DEFAULT_SERVICE_USER_LINUX;
}

interface Args {
    local: boolean;
    build: boolean;
    restart: boolean;
    user?: string;
}

async function parseArgs(): Promise<Args> {
    const argv = await yargs(hideBin(process.argv))
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
        .help()
        .alias("help", "h")
        .example("$0", "Interactive mode - prompts for VPS connection details")
        .example("$0 --local", "Build, deploy, and restart locally")
        .example("$0 --local --no-build", "Deploy existing bundle without rebuilding")
        .example("$0 --local --no-restart", "Build and deploy without restarting the service")
        .parse();

    return {
        local: argv.local,
        build: argv.build,
        restart: argv.restart,
        user: argv.user,
    };
}

/**
 * Resolve the project root by walking up from this script's location.
 *
 * This file lives at <root>/packages/host-utils/src/redeploy.ts,
 * so the project root is 3 levels up from the directory containing this file.
 */
function getProjectRoot(): string {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(__dirname, "..", "..", "..");
}

/**
 * Get the path to the sync bundle within the project
 */
function getSyncBundlePath(): string {
    return path.join(getProjectRoot(), "packages", "sync", "dist", "bundle.js");
}

/**
 * Get the target bundle path on the deployment machine
 */
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

    // Linux
    const home = `/home/${serviceUser}`;
    return `${home}/.config/syncreeper/sync/dist/bundle.js`;
}

/**
 * Build the sync bundle
 */
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

/**
 * Deploy locally on the target machine
 */
async function deployLocal(
    serviceUser: string,
    shouldBuild: boolean,
    shouldRestart: boolean
): Promise<void> {
    const platform = process.platform;
    const username = os.userInfo().username;

    // Build if requested
    if (shouldBuild) {
        await buildSyncBundle();
    }

    // Verify the bundle exists
    const bundlePath = getSyncBundlePath();
    if (!fs.existsSync(bundlePath)) {
        console.error(`Bundle not found at ${bundlePath}`);
        console.error("Run with --build (default) or build manually: pnpm run build:sync");
        process.exit(1);
    }

    const targetPath = getTargetBundlePath(platform, serviceUser);
    const targetDir = path.dirname(targetPath);

    // Ensure target directory exists
    if (!fs.existsSync(targetDir)) {
        console.error(`Target directory does not exist: ${targetDir}`);
        console.error("Has SyncReeper been deployed with 'pulumi up' at least once?");
        process.exit(1);
    }

    // Copy the bundle
    console.log(`Copying bundle to ${targetPath}...`);
    try {
        fs.copyFileSync(bundlePath, targetPath);
        console.log("Bundle copied successfully.");
    } catch (err) {
        console.error(`Failed to copy bundle: ${err}`);
        console.error("\nIf this is a permissions issue, try running as root or the service user:");
        console.error(`  sudo pnpm run redeploy -- --local --user ${serviceUser}`);
        process.exit(1);
    }

    // Verify the bundle
    console.log("Verifying bundle...");
    try {
        await execa("node", ["--check", targetPath]);
        console.log("Bundle verified (valid JavaScript).\n");
    } catch {
        console.error("Bundle verification failed! The deployed file is not valid JavaScript.");
        console.error("This should not happen - the build may be corrupted.");
        process.exit(1);
    }

    // Restart the service
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

/**
 * Restart the sync service on Linux (user-level systemd)
 */
async function restartLinux(serviceUser: string, currentUser: string): Promise<void> {
    console.log("Restarting sync service...");

    if (currentUser === serviceUser) {
        // Running as the service user - use systemctl --user directly
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
        // Running as root - use sudo -u to act as the service user
        const uid = (await execa("id", ["-u", serviceUser])).stdout.trim();
        const runtimeDir = `/run/user/${uid}`;
        const env = {
            XDG_RUNTIME_DIR: runtimeDir,
            DBUS_SESSION_BUS_ADDRESS: `unix:path=${runtimeDir}/bus`,
        };

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
        console.error(`  1. Run as root: sudo pnpm run redeploy -- --local`);
        console.error(
            `  2. Run as the service user: sudo -u ${serviceUser} pnpm run redeploy -- --local`
        );
        console.error(`  3. Skip restart: pnpm run redeploy -- --local --no-restart`);
        process.exit(1);
    }
}

/**
 * Restart the sync on macOS (launchd)
 */
async function restartDarwin(serviceUser: string): Promise<void> {
    console.log("Restarting sync service...");

    const plistName = "com.syncreeper.sync";

    // Check if the agent is loaded
    try {
        const result = await execa("launchctl", ["list", plistName], { reject: false });
        if (result.exitCode === 0) {
            // Agent is loaded - unload and reload it
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

/**
 * Deploy via SSH to a remote machine
 */
async function deployRemote(
    host: string,
    sshUser: string,
    serviceUser: string,
    shouldBuild: boolean,
    shouldRestart: boolean
): Promise<void> {
    // Build if requested (locally)
    if (shouldBuild) {
        await buildSyncBundle();
    }

    // Verify the bundle exists locally
    const bundlePath = getSyncBundlePath();
    if (!fs.existsSync(bundlePath)) {
        console.error(`Bundle not found at ${bundlePath}`);
        console.error("Run with --build (default) or build manually: pnpm run build:sync");
        process.exit(1);
    }

    // Determine the remote target path (always Linux for SSH mode since we SSH to VPS)
    const targetPath = getTargetBundlePath("linux", serviceUser);

    // Copy the bundle via scp
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

    // Verify the bundle on the remote machine
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

    // Restart the service on the remote machine
    if (shouldRestart) {
        console.log("Restarting sync service on remote...");

        // Build the restart command - needs D-Bus env vars for user systemctl
        const restartCmd = [
            `UID_VAL=$(id -u ${serviceUser})`,
            `export XDG_RUNTIME_DIR=/run/user/$UID_VAL`,
            `export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$UID_VAL/bus`,
            "systemctl --user daemon-reload",
            "systemctl --user restart syncreeper-sync.timer",
            'echo "Sync timer restarted."',
        ].join(" && ");

        // If the SSH user is not the service user, wrap in sudo -u
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

async function main(): Promise<void> {
    const args = await parseArgs();
    const serviceUser = args.user ?? (await getDefaultServiceUser());

    console.log("\nSyncReeper Redeploy\n");

    if (args.local) {
        console.log(
            `Mode: Local | User: ${serviceUser} | Build: ${args.build} | Restart: ${args.restart}\n`
        );
        await deployLocal(serviceUser, args.build, args.restart);
    } else {
        // Get SSH connection details
        const host = await input({
            message: "VPS hostname or IP:",
            validate: (v) => v.length > 0 || "Hostname is required",
        });

        const sshUser = await input({
            message: "SSH username:",
            default: serviceUser,
        });

        console.log(
            `\nMode: SSH | Host: ${sshUser}@${host} | User: ${serviceUser} | Build: ${args.build} | Restart: ${args.restart}\n`
        );
        await deployRemote(host, sshUser, serviceUser, args.build, args.restart);
    }
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
