/**
 * Auto-updates service types
 *
 * Shared types for auto-updates configuration across platforms.
 */

import type * as pulumi from "@pulumi/pulumi";

/**
 * Options for setting up auto-updates
 */
export interface SetupAutoUpdatesOptions {
    /** Email address for update notifications (optional, Linux only) */
    notifyEmail?: string;
    /** Automatic reboot if required (default: true, Linux only) */
    autoReboot?: boolean;
    /** Resources to depend on (should include packages service) */
    dependsOn?: pulumi.Resource[];
}

/**
 * Result from setting up auto-updates
 */
export interface SetupAutoUpdatesResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
}
