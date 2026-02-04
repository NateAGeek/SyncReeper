/**
 * macOS-specific path configuration
 *
 * Uses standard macOS filesystem conventions:
 * - ~/Library/Application Support for application data
 * - ~/Library/Logs for logs
 * - ~/Library/LaunchAgents for user launch agents
 * - Home directory for repos
 */

import * as os from "node:os";
import * as path from "node:path";

/**
 * Get the current user's home directory
 */
function getHomeDir(): string {
    return os.homedir();
}

/**
 * Service user configuration for macOS
 * Uses the current user (no dedicated system user needed)
 */
export function getServiceUserDarwin() {
    const username = os.userInfo().username;
    const home = getHomeDir();

    return {
        name: username,
        home: home,
        shell: "/bin/zsh",
    } as const;
}

/**
 * Application paths for macOS
 * These are computed at runtime since they depend on the user's home directory
 */
export function getPathsDarwin() {
    const home = getHomeDir();
    const appSupport = path.join(home, "Library", "Application Support");

    return {
        /** Where the sync application is installed */
        syncApp: path.join(appSupport, "SyncReeper", "sync"),
        /** Convenience script for manual sync */
        syncScript: path.join(home, ".local", "bin", "sync-repos"),
        /** Syncthing configuration directory */
        syncthingConfig: path.join(appSupport, "Syncthing"),
        /** Log directory */
        logDir: path.join(home, "Library", "Logs", "SyncReeper"),
        /** Environment/secrets directory */
        envDir: path.join(appSupport, "SyncReeper", "config"),
        /** LaunchAgents directory for launchd plists */
        launchAgents: path.join(home, "Library", "LaunchAgents"),
    } as const;
}

/**
 * Default configuration values for macOS
 */
export function getDefaultConfigDarwin() {
    const home = getHomeDir();

    return {
        /** Default sync schedule */
        schedule: "daily",
        /** Default repository storage path */
        reposPath: path.join(home, "SyncReeper", "repos"),
        /** Default Syncthing folder ID */
        syncthingFolderId: "repos",
    } as const;
}
