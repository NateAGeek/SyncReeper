/**
 * Configuration types for SyncReeper
 *
 * Platform-aware configuration that provides the correct paths and settings
 * for both Linux VPS and macOS local deployments.
 */

import { isLinux, isMacOS } from "../lib/platform";
import { SERVICE_USER_LINUX, PATHS_LINUX, DEFAULT_CONFIG_LINUX } from "./paths.linux";
import { getServiceUserDarwin, getPathsDarwin, getDefaultConfigDarwin } from "./paths.darwin";

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
 * Gets the service user configuration for the current platform
 */
export function getServiceUser(): ServiceUserConfig {
    if (isMacOS()) {
        return getServiceUserDarwin();
    }
    if (isLinux()) {
        return { ...SERVICE_USER_LINUX };
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

/**
 * Gets the application paths for the current platform
 */
export function getPaths(): PathsConfig {
    if (isMacOS()) {
        return getPathsDarwin();
    }
    if (isLinux()) {
        return { ...PATHS_LINUX };
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

/**
 * Gets the default configuration for the current platform
 */
export function getDefaultConfig(): DefaultConfig {
    if (isMacOS()) {
        return getDefaultConfigDarwin();
    }
    if (isLinux()) {
        return { ...DEFAULT_CONFIG_LINUX };
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

// Legacy exports for backwards compatibility
// These will use the current platform's values

/**
 * @deprecated Use getDefaultConfig() instead for platform-aware defaults
 */
export const DEFAULT_CONFIG = {
    get schedule() {
        return getDefaultConfig().schedule;
    },
    get reposPath() {
        return getDefaultConfig().reposPath;
    },
    get syncthingFolderId() {
        return getDefaultConfig().syncthingFolderId;
    },
} as const;

/**
 * @deprecated Use getServiceUser() instead for platform-aware user config
 */
export const SERVICE_USER = {
    get name() {
        return getServiceUser().name;
    },
    get home() {
        return getServiceUser().home;
    },
    get shell() {
        return getServiceUser().shell;
    },
} as const;

/**
 * @deprecated Use getPaths() instead for platform-aware paths
 */
export const PATHS = {
    get syncApp() {
        return getPaths().syncApp;
    },
    get syncScript() {
        return getPaths().syncScript;
    },
    get syncthingConfig() {
        return getPaths().syncthingConfig;
    },
    get logDir() {
        return getPaths().logDir;
    },
} as const;
