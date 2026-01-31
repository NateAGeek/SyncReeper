/**
 * Configuration types for SyncReeper
 */

/**
 * GitHub configuration for syncing repositories
 */
export interface GitHubConfig {
    /** GitHub Personal Access Token with 'repo' scope */
    token: string;
    /** GitHub username for API calls */
    username: string;
}

/**
 * Syncthing configuration
 */
export interface SyncthingConfig {
    /** List of trusted device IDs that can connect */
    trustedDevices: string[];
    /** Folder ID for the shared repos folder (must match on all devices) */
    folderId: string;
}

/**
 * SSH configuration
 */
export interface SSHConfig {
    /** List of authorized SSH public keys */
    authorizedKeys: string[];
}

/**
 * Sync schedule and paths configuration
 */
export interface SyncConfig {
    /** Systemd timer schedule (e.g., "daily", "hourly", "*-*-* 03:00:00") */
    schedule: string;
    /** Path where repositories will be stored */
    reposPath: string;
}

/**
 * Complete SyncReeper configuration
 */
export interface SyncReeperConfig {
    github: GitHubConfig;
    syncthing: SyncthingConfig;
    ssh: SSHConfig;
    sync: SyncConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
    schedule: "daily",
    reposPath: "/srv/repos",
    syncthingFolderId: "repos",
} as const;

/**
 * Service user configuration
 */
export const SERVICE_USER = {
    name: "syncreeper",
    home: "/home/syncreeper",
    shell: "/bin/bash",
} as const;

/**
 * Application paths
 */
export const PATHS = {
    syncApp: "/opt/syncreeper/sync",
    syncScript: "/usr/local/bin/sync-repos",
    syncthingConfig: "/home/syncreeper/.config/syncthing",
    logDir: "/var/log/syncreeper",
} as const;
