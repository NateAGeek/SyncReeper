/**
 * Configuration loader for SyncReeper
 * Loads configuration from Pulumi config with validation
 */

import * as pulumi from "@pulumi/pulumi";
import {
    type SyncReeperConfig,
    type GitHubConfig,
    type SyncthingConfig,
    type SSHConfig,
    type SyncConfig,
    DEFAULT_CONFIG,
} from "./types.js";

/**
 * Loads and validates the complete SyncReeper configuration
 * from Pulumi config secrets and values
 */
export function getConfig(): SyncReeperConfig {
    const config = new pulumi.Config("syncreeper");

    const github: GitHubConfig = {
        token: config.requireSecret("github-token").apply((t) => t),
        username: config.require("github-username"),
    } as unknown as GitHubConfig;

    const syncthing: SyncthingConfig = {
        apiKey: config.requireSecret("syncthing-api-key").apply((k) => k),
        trustedDevices: config.requireObject<string[]>("syncthing-trusted-devices"),
        folderId: config.get("syncthing-folder-id") ?? DEFAULT_CONFIG.syncthingFolderId,
    } as unknown as SyncthingConfig;

    const ssh: SSHConfig = {
        authorizedKeys: config.requireObject<string[]>("ssh-authorized-keys"),
    };

    const sync: SyncConfig = {
        schedule: config.get("sync-schedule") ?? DEFAULT_CONFIG.schedule,
        reposPath: config.get("repos-path") ?? DEFAULT_CONFIG.reposPath,
    };

    return { github, syncthing, ssh, sync };
}

/**
 * Gets individual config values for use in resources
 * Returns Pulumi Outputs where secrets are involved
 */
export function getConfigValues() {
    const config = new pulumi.Config("syncreeper");

    return {
        githubToken: config.requireSecret("github-token"),
        githubUsername: config.require("github-username"),
        syncthingApiKey: config.requireSecret("syncthing-api-key"),
        syncthingTrustedDevices: config.requireObject<string[]>("syncthing-trusted-devices"),
        syncthingFolderId: config.get("syncthing-folder-id") ?? DEFAULT_CONFIG.syncthingFolderId,
        sshAuthorizedKeys: config.requireObject<string[]>("ssh-authorized-keys"),
        syncSchedule: config.get("sync-schedule") ?? DEFAULT_CONFIG.schedule,
        reposPath: config.get("repos-path") ?? DEFAULT_CONFIG.reposPath,
    };
}

export * from "./types.js";
