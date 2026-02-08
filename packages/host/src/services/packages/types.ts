/**
 * Package service types
 *
 * Shared types for the packages service across platforms.
 */

import type * as pulumi from "@pulumi/pulumi";

/**
 * Options for setting up packages
 */
export interface SetupPackagesOptions {
    /** Resources to depend on */
    dependsOn?: pulumi.Resource[];
}

/**
 * Result from setting up packages
 */
export interface SetupPackagesResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
}
