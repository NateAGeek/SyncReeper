/**
 * macOS-specific path configuration
 *
 * Uses standard macOS filesystem conventions:
 * - ~/Library/Application Support for application data
 * - ~/Library/Logs for logs
 * - ~/Library/LaunchAgents for user launch agents
 * - Home directory for repos
 *
 * Supports an optional username override. When provided, paths are derived
 * from that user's home directory (/Users/{username}) instead of the current user.
 */

import * as os from "node:os";
import * as path from "node:path";

/**
 * Get the home directory for a given user, or the current user if not specified
 */
function getHomeDirForUser(username?: string): string {
    if (!username || username === os.userInfo().username) {
        return os.homedir();
    }
    // On macOS, user home directories are under /Users/{username}
    return `/Users/${username}`;
}

/**
 * Service user configuration for macOS
 * Uses the specified user or falls back to the current user
 */
export function getServiceUserDarwin(username?: string) {
    const name = username ?? os.userInfo().username;
    const home = getHomeDirForUser(username);

    return {
        name,
        home,
        shell: "/bin/zsh",
    } as const;
}

/**
 * Application paths for macOS
 * These are computed at runtime since they depend on the user's home directory
 */
export function getPathsDarwin(username?: string) {
    const home = getHomeDirForUser(username);
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
        /** User systemd directory (not used on macOS) */
        userSystemd: "",
        /** LaunchAgents directory for launchd plists */
        launchAgents: path.join(home, "Library", "LaunchAgents"),
    } as const;
}

/**
 * Default configuration values for macOS
 */
export function getDefaultConfigDarwin(username?: string) {
    const home = getHomeDirForUser(username);

    return {
        /** Default sync schedule */
        schedule: "daily",
        /** Default repository storage path */
        reposPath: path.join(home, "SyncReeper", "repos"),
        /** Default Syncthing folder ID */
        syncthingFolderId: "repos",
    } as const;
}
