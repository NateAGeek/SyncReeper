/**
 * GitHub Sync service types
 *
 * Shared types for GitHub sync configuration across platforms.
 */

import type * as pulumi from "@pulumi/pulumi";
import type { SyncReeperConfig } from "../../config/types";

/**
 * Options for setting up GitHub sync
 */
export interface SetupGitHubSyncOptions {
    /** SyncReeper configuration */
    config: SyncReeperConfig;
    /** Resources to depend on */
    dependsOn?: pulumi.Resource[];
}

/**
 * Result from setting up GitHub sync
 */
export interface SetupGitHubSyncResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
}
