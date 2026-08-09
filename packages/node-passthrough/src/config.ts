/**
 * Passthrough tunnel client configuration
 *
 * Manages a small JSON config file at ~/.config/syncreeper/passthrough.json
 * that stores VPS connection details so subsequent commands don't need
 * to re-prompt for them.
 *
 * The tunnel runs as a macOS LaunchDaemon (system-level service) so it
 * persists across user logout, lock screen, and reboots without requiring
 * a user login session.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

/**
 * Passthrough client configuration shape
 */
export interface PassthroughClientConfig {
    /** VPS hostname or IP address */
    vpsAddress: string;
    /** VPS SSH port (default: 22) */
    vpsPort: number;
    /** Reverse tunnel port on VPS (default: 2222) */
    tunnelPort: number;
    /** Path to the SSH private key for the tunnel */
    keyPath: string;
    /** The username on the VPS tunnel user (always 'passthrough') */
    tunnelUser: string;
}

/**
 * Default configuration values
 */
export const DEFAULTS = {
    tunnelUser: "passthrough",
    vpsPort: 22,
    tunnelPort: 2222,
    keyName: "syncreeper-passthrough",
    plistLabel: "com.syncreeper.passthrough",
    logDir: "/var/log/syncreeper",
} as const;

/**
 * Gets the config directory path
 */
export function getConfigDir(): string {
    return join(homedir(), ".config", "syncreeper");
}

/**
 * Gets the config file path
 */
export function getConfigPath(): string {
    return join(getConfigDir(), "passthrough.json");
}

/**
 * Gets the default SSH key path
 */
export function getDefaultKeyPath(): string {
    return join(homedir(), ".ssh", DEFAULTS.keyName);
}

/**
 * Gets the LaunchDaemon plist path
 */
export function getPlistPath(): string {
    return join("/Library", "LaunchDaemons", `${DEFAULTS.plistLabel}.plist`);
}

/**
 * Gets the legacy LaunchAgent plist path (for migration detection)
 */
export function getLegacyPlistPath(): string {
    return join(homedir(), "Library", "LaunchAgents", `${DEFAULTS.plistLabel}.plist`);
}

/**
 * Gets the current username for the daemon's UserName key.
 * The daemon runs autossh as this user so it can access the user's SSH keys.
 */
export function getCurrentUsername(): string {
    return process.env.USER ?? userInfo().username;
}

/**
 * Gets the stdout log path
 */
export function getLogOutPath(): string {
    return join(DEFAULTS.logDir, "passthrough.out.log");
}

/**
 * Gets the stderr log path
 */
export function getLogErrPath(): string {
    return join(DEFAULTS.logDir, "passthrough.err.log");
}

/**
 * Loads the passthrough client configuration.
 * Returns null if the config file doesn't exist.
 */
export async function loadConfig(): Promise<PassthroughClientConfig | null> {
    const configPath = getConfigPath();
    if (!existsSync(configPath)) {
        return null;
    }

    try {
        const raw = await readFile(configPath, "utf-8");
        return JSON.parse(raw) as PassthroughClientConfig;
    } catch {
        return null;
    }
}

/**
 * Saves the passthrough client configuration.
 */
export async function saveConfig(config: PassthroughClientConfig): Promise<void> {
    const configDir = getConfigDir();
    if (!existsSync(configDir)) {
        await mkdir(configDir, { recursive: true });
    }

    const configPath = getConfigPath();
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * Checks if configuration exists
 */
export function configExists(): boolean {
    return existsSync(getConfigPath());
}
