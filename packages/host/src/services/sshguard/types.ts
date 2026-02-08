/**
 * SSHGuard service types
 *
 * Shared types for SSHGuard configuration across platforms.
 */

import type * as pulumi from "@pulumi/pulumi";

/**
 * Options for setting up SSHGuard
 */
export interface SetupSSHGuardOptions {
    /** Resources to depend on (should include packages service) */
    dependsOn?: pulumi.Resource[];
}

/**
 * Result from setting up SSHGuard
 */
export interface SetupSSHGuardResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
}

/**
 * SSHGuard configuration
 * These are reasonable defaults for brute-force protection
 */
export const SSHGUARD_CONFIG = {
    /** Block attackers for 2 hours initially */
    blockTime: 7200,
    /** Increase block time by 1.5x for repeat offenders */
    blockTimeMultiplier: 1.5,
    /** Threshold score before blocking (lower = more aggressive) */
    threshold: 30,
    /** Reset attack score after this many seconds of good behavior */
    detectionTime: 1800,
    /** Never block these addresses (localhost) */
    whitelist: ["127.0.0.0/8", "::1/128"],
} as const;
