/**
 * Shared helpers for passthrough tunnel commands
 */

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { execa } from "execa";

import { type PassthroughClientConfig, DEFAULTS, getPlistPath } from "../config.js";

/**
 * Finds the autossh binary path
 */
async function findAutosshPath(): Promise<string> {
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
 * Generates the launchd plist XML for autossh
 */
function generatePlist(config: PassthroughClientConfig, autosshPath: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${DEFAULTS.plistLabel}</string>

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
    <string>/tmp/syncreeper-passthrough.out.log</string>

    <key>StandardErrorPath</key>
    <string>/tmp/syncreeper-passthrough.err.log</string>

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
 * Generates and writes the plist file from saved config
 */
export async function generatePlistFromConfig(config: PassthroughClientConfig): Promise<void> {
    const autosshPath = await findAutosshPath();
    const plistContent = generatePlist(config, autosshPath);
    const plistPath = getPlistPath();
    await writeFile(plistPath, plistContent, "utf-8");
}
