/**
 * Firewall service - Configures UFW on the VPS
 *
 * Security approach:
 * - Default deny incoming, allow outgoing
 * - Only SSH (port 22) is exposed with rate limiting
 * - Syncthing communicates via relay servers (outbound)
 * - Syncthing GUI accessed via SSH tunnel
 *
 * Note: UFW is installed by the packages service.
 * This service only handles configuration.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../../lib/command.js";
import { DEFAULT_FIREWALL_RULES, generateFirewallCommands, type FirewallRule } from "./rules.js";

export interface SetupFirewallOptions {
    /** Custom firewall rules (defaults to SSH-only) */
    rules?: FirewallRule[];
    /** Resources to depend on (should include packages service) */
    dependsOn?: pulumi.Resource[];
}

export interface SetupFirewallResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
}

/**
 * Sets up UFW firewall with secure defaults
 * - Configures default deny incoming, allow outgoing
 * - Adds SSH rule with rate limiting
 *
 * Prerequisites: UFW must be installed (handled by packages service)
 */
export function setupFirewall(options: SetupFirewallOptions = {}): SetupFirewallResult {
    const { rules = DEFAULT_FIREWALL_RULES, dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];

    // Generate all firewall commands
    const firewallCommands = generateFirewallCommands(rules);

    // Configure UFW with all rules
    const configureUfw = runCommand({
        name: "configure-ufw",
        create: firewallCommands.join(" && "),
        delete: `
            ufw disable || true
            echo "UFW disabled"
        `.trim(),
        dependsOn,
    });
    resources.push(configureUfw);

    // Verify UFW status
    const verifyUfw = runCommand({
        name: "verify-ufw",
        create: `
            ufw status verbose
            echo "Firewall configured successfully"
        `.trim(),
        dependsOn: [configureUfw],
    });
    resources.push(verifyUfw);

    return { resources };
}

export type { FirewallRule } from "./rules.js";
