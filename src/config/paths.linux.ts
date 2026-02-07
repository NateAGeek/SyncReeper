/**
 * Linux-specific path configuration
 *
 * Uses standard Linux filesystem conventions for a VPS deployment.
 * All paths are derived from the configured service username.
 */

/** Default service username for Linux */
export const DEFAULT_SERVICE_USER_LINUX = "syncreeper";

/**
 * Service user configuration for Linux
 * Dedicated user for security isolation
 */
export function getServiceUserLinux(username?: string) {
    const name = username ?? DEFAULT_SERVICE_USER_LINUX;
    return {
        name,
        home: `/home/${name}`,
        shell: "/bin/bash",
    } as const;
}

/**
 * Application paths for Linux
 * All paths derived from the service user's home directory
 */
export function getPathsLinux(username?: string) {
    const { home } = getServiceUserLinux(username);

    return {
        /** Where the sync application is installed (user home for user-level service) */
        syncApp: `${home}/.config/syncreeper/sync`,
        /** Convenience script for manual sync */
        syncScript: "/usr/local/bin/sync-repos",
        /** Syncthing configuration directory */
        syncthingConfig: `${home}/.config/syncthing`,
        /** Log directory */
        logDir: "/var/log/syncreeper",
        /** Environment/secrets directory (system-level for security) */
        envDir: "/etc/syncreeper",
        /** User systemd directory for user-level services */
        userSystemd: `${home}/.config/systemd/user`,
        /** LaunchAgents directory (not used on Linux, but included for type compatibility) */
        launchAgents: "",
    } as const;
}

/**
 * Default configuration values for Linux
 */
export function getDefaultConfigLinux() {
    return {
        /** Default sync schedule */
        schedule: "daily",
        /** Default repository storage path */
        reposPath: "/srv/repos",
        /** Default Syncthing folder ID */
        syncthingFolderId: "repos",
    } as const;
}

// Legacy constant exports for backwards compatibility
// These use the default username

/**
 * @deprecated Use getServiceUserLinux() instead
 */
export const SERVICE_USER_LINUX = {
    get name() {
        return getServiceUserLinux().name;
    },
    get home() {
        return getServiceUserLinux().home;
    },
    get shell() {
        return getServiceUserLinux().shell;
    },
} as const;

/**
 * @deprecated Use getPathsLinux() instead
 */
export const PATHS_LINUX = {
    get syncApp() {
        return getPathsLinux().syncApp;
    },
    get syncScript() {
        return getPathsLinux().syncScript;
    },
    get syncthingConfig() {
        return getPathsLinux().syncthingConfig;
    },
    get logDir() {
        return getPathsLinux().logDir;
    },
    get envDir() {
        return getPathsLinux().envDir;
    },
    get userSystemd() {
        return getPathsLinux().userSystemd;
    },
    get launchAgents() {
        return getPathsLinux().launchAgents;
    },
} as const;

/**
 * @deprecated Use getDefaultConfigLinux() instead
 */
export const DEFAULT_CONFIG_LINUX = {
    get schedule() {
        return getDefaultConfigLinux().schedule;
    },
    get reposPath() {
        return getDefaultConfigLinux().reposPath;
    },
    get syncthingFolderId() {
        return getDefaultConfigLinux().syncthingFolderId;
    },
} as const;
