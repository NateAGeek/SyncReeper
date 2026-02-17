/**
 * Passthrough tunnel service types
 *
 * Shared types for reverse SSH tunnel configuration.
 *
 * The passthrough service creates a dedicated 'passthrough' user on the VPS
 * that accepts reverse SSH tunnels from the home machine (e.g., Mac Mini).
 * This allows SSH access to the home machine from the VPS without
 * exposing any ports on the home network.
 */

import type * as pulumi from "@pulumi/pulumi";

/**
 * Options for setting up the passthrough tunnel service
 */
export interface SetupPassthroughOptions {
    /** Authorized public keys for the passthrough user (from home machine) */
    authorizedKeys: string[];
    /** Port on VPS for the reverse tunnel */
    tunnelPort?: number;
    /** Resources to depend on (should include packages and user creation) */
    dependsOn?: pulumi.Resource[];
}

/**
 * Result from setting up the passthrough tunnel service
 */
export interface SetupPassthroughResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
}

/**
 * Passthrough tunnel defaults
 */
export const PASSTHROUGH_DEFAULTS = {
    /** Dedicated user for tunnel connections */
    username: "passthrough",
    /** Home directory for the passthrough user */
    homeDir: "/home/passthrough",
    /** Shell for the passthrough user (no login) */
    shell: "/usr/sbin/nologin",
    /** Default tunnel port on the VPS */
    tunnelPort: 2222,
    /** SSHD drop-in config path (50- prefix so it loads before 99-hardening) */
    sshdConfigPath: "/etc/ssh/sshd_config.d/50-passthrough-tunnel.conf",
} as const;
