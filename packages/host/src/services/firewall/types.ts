/**
 * Firewall service types
 *
 * Shared types for firewall configuration across platforms.
 */

import type * as pulumi from "@pulumi/pulumi";

/**
 * Defines a firewall rule
 */
export interface FirewallRule {
    /** Rule description for documentation */
    description: string;
    /** Port number or range (e.g., "22", "8000:8100") */
    port?: string;
    /** Protocol: tcp, udp, or both */
    proto?: "tcp" | "udp" | "any";
    /** Action: allow or deny */
    action: "allow" | "deny";
    /** Direction: in or out */
    direction: "in" | "out";
    /** Optional: limit connections (for rate limiting) */
    limit?: boolean;
    /** Optional: from address/network (e.g., "any", "192.168.1.0/24") */
    from?: string;
}

/**
 * Options for setting up the firewall
 */
export interface SetupFirewallOptions {
    /** Custom firewall rules (defaults to SSH-only) */
    rules?: FirewallRule[];
    /** Resources to depend on (should include packages service) */
    dependsOn?: pulumi.Resource[];
}

/**
 * Result from setting up the firewall
 */
export interface SetupFirewallResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
}

/**
 * Default firewall rules for SyncReeper
 *
 * Security model:
 * - Default deny incoming
 * - Allow outgoing (for apt/brew, git, syncthing relay)
 * - Only SSH (22) is exposed, with rate limiting
 * - Syncthing GUI/API accessed via SSH tunnel
 * - Syncthing sync uses relay servers (outbound connections only)
 */
export const DEFAULT_FIREWALL_RULES: FirewallRule[] = [
    {
        description: "Allow SSH with rate limiting",
        port: "22",
        proto: "tcp",
        action: "allow",
        direction: "in",
        limit: true,
    },
];
