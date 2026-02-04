/**
 * Syncthing service types
 *
 * Shared types for Syncthing configuration across platforms.
 */

import type * as pulumi from "@pulumi/pulumi";
import type { SyncReeperConfig } from "../../config/types";

/**
 * Options for setting up Syncthing
 */
export interface SetupSyncthingOptions {
    /** SyncReeper configuration */
    config: SyncReeperConfig;
    /** Resources to depend on */
    dependsOn?: pulumi.Resource[];
}

/**
 * Result from setting up Syncthing
 */
export interface SetupSyncthingResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
}
