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
    type PassthroughConfig,
    DEFAULT_CONFIG,
    getServiceUser,
    setConfiguredUsername,
} from "./types";

/**
 * Loads and validates the complete SyncReeper configuration
 * from Pulumi config secrets and values.
 *
 * Also sets the module-level configured username so that
 * getServiceUser(), getPaths(), and getDefaultConfig() use it.
 */
export function getConfig(): SyncReeperConfig {
    const config = new pulumi.Config("syncreeper");

    // Read the optional service-user config key and set it module-wide
    const serviceUserName = config.get("service-user") ?? undefined;
    setConfiguredUsername(serviceUserName);

    // Now getServiceUser() / getPaths() / getDefaultConfig() will use the configured username
    const resolvedUser = getServiceUser();

    const github: GitHubConfig = {
        token: config.requireSecret("github-token").apply((t) => t),
        username: config.require("github-username"),
    } as unknown as GitHubConfig;

    const syncthing: SyncthingConfig = {
        trustedDevices: config.requireObject<string[]>("syncthing-trusted-devices"),
        folderId: config.get("syncthing-folder-id") ?? DEFAULT_CONFIG.syncthingFolderId,
    };

    const ssh: SSHConfig = {
        authorizedKeys: config.requireObject<string[]>("ssh-authorized-keys"),
    };

    const sync: SyncConfig = {
        schedule: config.get("sync-schedule") ?? DEFAULT_CONFIG.schedule,
        reposPath: config.get("repos-path") ?? DEFAULT_CONFIG.reposPath,
    };

    // Passthrough tunnel configuration (optional)
    const passthroughEnabled = config.getBoolean("passthrough-enabled") ?? false;
    const passthrough: PassthroughConfig | undefined = passthroughEnabled
        ? {
              enabled: true,
              tunnelPort: config.getNumber("passthrough-port") ?? 2222,
              authorizedKeys: config.requireObject<string[]>("passthrough-authorized-keys"),
          }
        : undefined;

    return {
        github,
        syncthing,
        ssh,
        sync,
        serviceUser: resolvedUser.name,
        passthrough,
    };
}

export * from "./types";
