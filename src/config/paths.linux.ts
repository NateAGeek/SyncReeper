/**
 * Linux-specific path configuration
 *
 * Uses standard Linux filesystem conventions for a VPS deployment.
 */

/**
 * Service user configuration for Linux
 * Dedicated syncreeper user for security isolation
 */
export const SERVICE_USER_LINUX = {
    name: "syncreeper",
    home: "/home/syncreeper",
    shell: "/bin/bash",
} as const;

/**
 * Application paths for Linux
 */
export const PATHS_LINUX = {
    /** Where the sync application is installed (user home for user-level service) */
    syncApp: "/home/syncreeper/.config/syncreeper/sync",
    /** Convenience script for manual sync */
    syncScript: "/usr/local/bin/sync-repos",
    /** Syncthing configuration directory */
    syncthingConfig: "/home/syncreeper/.config/syncthing",
    /** Log directory */
    logDir: "/var/log/syncreeper",
    /** Environment/secrets directory (system-level for security) */
    envDir: "/etc/syncreeper",
    /** User systemd directory for user-level services */
    userSystemd: "/home/syncreeper/.config/systemd/user",
    /** LaunchAgents directory (not used on Linux, but included for type compatibility) */
    launchAgents: "",
} as const;

/**
 * Default configuration values for Linux
 */
export const DEFAULT_CONFIG_LINUX = {
    /** Default sync schedule */
    schedule: "daily",
    /** Default repository storage path */
    reposPath: "/srv/repos",
    /** Default Syncthing folder ID */
    syncthingFolderId: "repos",
} as const;
