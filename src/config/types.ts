/**
 * Configuration types for SyncReeper
 *
 * Platform-aware configuration that provides the correct paths and settings
 * for both Linux VPS and macOS local deployments.
 *
 * Supports a configurable service username via `syncreeper:service-user` Pulumi config.
 * When not set, defaults to "syncreeper" on Linux and the current user on macOS.
 */

import { isLinux, isMacOS } from "../lib/platform";
import {
    getServiceUserLinux,
    getPathsLinux,
    getDefaultConfigLinux,
    DEFAULT_SERVICE_USER_LINUX,
} from "./paths.linux";
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

// ============================================================================
// Module-level configured username
// ============================================================================

/**
 * The configured service username, set by the config loader.
 * When undefined, platform defaults are used.
 */
let _configuredUsername: string | undefined;

/**
 * Sets the configured service username.
 * Called by the config loader after reading from Pulumi config.
 */
export function setConfiguredUsername(username: string | undefined): void {
    _configuredUsername = username;
}

/**
 * Gets the configured service username, or undefined if not set.
 */
export function getConfiguredUsername(): string | undefined {
    return _configuredUsername;
}

// ============================================================================
// Platform-aware getters (use configured username when available)
// ============================================================================

/**
 * Gets the service user configuration for the current platform.
 * Uses the configured username if set, otherwise platform defaults.
 *
 * @param username - Optional override. If not provided, uses the configured username.
 */
export function getServiceUser(username?: string): ServiceUserConfig {
    const effectiveUsername = username ?? _configuredUsername;

    if (isMacOS()) {
        return getServiceUserDarwin(effectiveUsername);
    }
    if (isLinux()) {
        return getServiceUserLinux(effectiveUsername);
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

/**
 * Gets the application paths for the current platform.
 * Uses the configured username if set, otherwise platform defaults.
 *
 * @param username - Optional override. If not provided, uses the configured username.
 */
export function getPaths(username?: string): PathsConfig {
    const effectiveUsername = username ?? _configuredUsername;

    if (isMacOS()) {
        return getPathsDarwin(effectiveUsername);
    }
    if (isLinux()) {
        return getPathsLinux(effectiveUsername);
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

/**
 * Gets the default configuration for the current platform.
 * Uses the configured username if set, otherwise platform defaults.
 *
 * @param username - Optional override. If not provided, uses the configured username.
 */
export function getDefaultConfig(username?: string): DefaultConfig {
    const effectiveUsername = username ?? _configuredUsername;

    if (isMacOS()) {
        return getDefaultConfigDarwin(effectiveUsername);
    }
    if (isLinux()) {
        return getDefaultConfigLinux();
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

// ============================================================================
// Legacy exports for backwards compatibility
// These will use the configured username (or platform defaults)
// ============================================================================

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
    get userSystemd() {
        return getPaths().userSystemd;
    },
} as const;
