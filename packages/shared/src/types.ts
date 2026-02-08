/**
 * Shared configuration types for SyncReeper
 *
 * These interfaces are used across multiple packages (host, host-utils)
 * and are kept here to avoid circular dependencies.
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
    /** Timer schedule (systemd OnCalendar or launchd StartCalendarInterval format) */
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
    /** The configured service username */
    serviceUser: string;
}

/**
 * Service user configuration shape
 */
export interface ServiceUserConfig {
    name: string;
    home: string;
    shell: string;
}

/**
 * Application paths configuration shape
 */
export interface PathsConfig {
    syncApp: string;
    syncScript: string;
    syncthingConfig: string;
    logDir: string;
    envDir: string;
    /** User systemd directory (Linux only, empty string on macOS) */
    userSystemd: string;
    launchAgents: string;
}

/**
 * Default configuration values shape
 */
export interface DefaultConfig {
    schedule: string;
    reposPath: string;
    syncthingFolderId: string;
}

/**
 * Default service username for Linux deployments
 */
export const DEFAULT_SERVICE_USER_LINUX = "syncreeper";
