/**
 * Shared helpers for passthrough tunnel commands
 *
 * Centralises plist generation, autossh discovery, and sudo-aware
 * launchd operations.  All other command modules import from here
 * rather than duplicating logic.
 */

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { execa } from "execa";

import {
    type PassthroughClientConfig,
    DEFAULTS,
    getPlistPath,
    getCurrentUsername,
    getLogOutPath,
    getLogErrPath,
} from "../config.js";

/**
 * Finds the autossh binary path
 */
export async function findAutosshPath(): Promise<string> {
    try {
        const { stdout } = await execa("which", ["autossh"]);
        return stdout.trim();
    } catch {
        const paths = ["/opt/homebrew/bin/autossh", "/usr/local/bin/autossh"];
        for (const p of paths) {
            if (existsSync(p)) return p;
        }
        return "/opt/homebrew/bin/autossh";
    }
}

/**
 * Generates the LaunchDaemon plist XML for autossh.
 *
 * Key differences from the previous LaunchAgent plist:
 *   - Includes UserName / GroupName so autossh runs as the setup user,
 *     not root, giving it access to the user's SSH key.
 *   - Lives at /Library/LaunchDaemons/ so the tunnel starts at boot
 *     and persists across logout, lock screen, and sleep.
 *   - Logs to /var/log/syncreeper/ instead of /tmp/.
 */
export function generatePlist(config: PassthroughClientConfig, autosshPath: string): string {
    const username = getCurrentUsername();

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${DEFAULTS.plistLabel}</string>

    <key>UserName</key>
    <string>${username}</string>

    <key>GroupName</key>
    <string>staff</string>

    <key>ProgramArguments</key>
    <array>
        <string>${autosshPath}</string>
        <string>-M</string>
        <string>0</string>
        <string>-N</string>
        <string>-o</string>
        <string>ServerAliveInterval=30</string>
        <string>-o</string>
        <string>ServerAliveCountMax=3</string>
        <string>-o</string>
        <string>ExitOnForwardFailure=yes</string>
        <string>-o</string>
        <string>StrictHostKeyChecking=accept-new</string>
        <string>-i</string>
        <string>${config.keyPath}</string>
        <string>-R</string>
        <string>${config.tunnelPort}:localhost:22</string>
        <string>-p</string>
        <string>${config.vpsPort}</string>
        <string>${config.tunnelUser}@${config.vpsAddress}</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${getLogOutPath()}</string>

    <key>StandardErrorPath</key>
    <string>${getLogErrPath()}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>AUTOSSH_GATETIME</key>
        <string>0</string>
    </dict>
</dict>
</plist>
`;
}

/**
 * Ensures the /var/log/syncreeper directory exists (requires sudo).
 */
async function ensureLogDir(): Promise<void> {
    if (!existsSync(DEFAULTS.logDir)) {
        await execa("sudo", ["mkdir", "-p", DEFAULTS.logDir], { stdio: "inherit" });
    }
    // Ensure the daemon user can write logs
    const username = getCurrentUsername();
    await execa("sudo", ["chown", `${username}:staff`, DEFAULTS.logDir], { stdio: "inherit" });
}

/**
 * Writes a plist to /Library/LaunchDaemons/ with correct ownership
 * and permissions (root:wheel, 644). Requires sudo.
 */
async function writeDaemonPlist(plistContent: string): Promise<void> {
    const plistPath = getPlistPath();

    // Write to a temp file first, then sudo mv into place
    const tmpPath = `/tmp/${DEFAULTS.plistLabel}.plist`;
    await writeFile(tmpPath, plistContent, "utf-8");

    await execa("sudo", ["mv", tmpPath, plistPath], { stdio: "inherit" });
    await execa("sudo", ["chown", "root:wheel", plistPath], { stdio: "inherit" });
    await execa("sudo", ["chmod", "644", plistPath], { stdio: "inherit" });
}

/**
 * Generates and installs the LaunchDaemon plist from saved config.
 * Creates the log directory, writes the plist with correct permissions,
 * and optionally loads the daemon.
 */
export async function generatePlistFromConfig(config: PassthroughClientConfig): Promise<void> {
    const autosshPath = await findAutosshPath();
    const plistContent = generatePlist(config, autosshPath);

    await ensureLogDir();
    await writeDaemonPlist(plistContent);
}

/**
 * Installs and loads the LaunchDaemon plist.
 * Unloads any existing daemon first, writes the new plist,
 * then loads it. All operations require sudo.
 */
export async function installAndLoadDaemon(config: PassthroughClientConfig): Promise<void> {
    const plistPath = getPlistPath();

    // Unload existing daemon if present
    if (existsSync(plistPath)) {
        console.log("Unloading existing LaunchDaemon...");
        try {
            await execa("sudo", ["launchctl", "unload", plistPath], { stdio: "inherit" });
        } catch {
            // May not be loaded, that's fine
        }
    }

    // Generate and write the plist
    await generatePlistFromConfig(config);
    console.log(`LaunchDaemon plist written to: ${plistPath}`);

    // Load the daemon
    await execa("sudo", ["launchctl", "load", plistPath], { stdio: "inherit" });
    console.log("LaunchDaemon loaded successfully.");
}
