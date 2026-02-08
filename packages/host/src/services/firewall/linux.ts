/**
 * Linux firewall service - UFW implementation
 *
 * Configures UFW (Uncomplicated Firewall) on Linux.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../../lib/command";
import type { FirewallRule, SetupFirewallOptions, SetupFirewallResult } from "./types";
import { DEFAULT_FIREWALL_RULES } from "./types";

/**
 * UFW default policies
 */
const UFW_POLICIES = {
    /** Deny all incoming connections by default */
    incoming: "deny",
    /** Allow all outgoing connections (needed for apt, git, syncthing relay) */
    outgoing: "allow",
    /** Deny routed/forwarded traffic */
    routed: "deny",
} as const;

/**
 * Generates UFW command for a single rule
 */
export function generateRuleCommand(rule: FirewallRule): string {
    const parts: string[] = ["ufw"];

    // Add limit if specified (only works with allow)
    if (rule.limit && rule.action === "allow") {
        parts.push("limit");
    } else {
        parts.push(rule.action);
    }

    // Add direction
    parts.push(rule.direction);

    // Add from address if specified
    if (rule.from) {
        parts.push("from", rule.from);
    }

    // Add port and protocol
    if (rule.port) {
        parts.push("to", "any", "port", rule.port);
        if (rule.proto && rule.proto !== "any") {
            parts.push("proto", rule.proto);
        }
    }

    // Add comment for documentation
    parts.push("comment", `"${rule.description}"`);

    return parts.join(" ");
}

/**
 * Generates all UFW commands to configure the firewall
 */
export function generateFirewallCommands(rules: FirewallRule[]): string[] {
    const commands: string[] = [];

    // Reset UFW to clean state (non-interactive)
    commands.push("echo 'y' | ufw reset");

    // Set default policies
    commands.push(`ufw default ${UFW_POLICIES.incoming} incoming`);
    commands.push(`ufw default ${UFW_POLICIES.outgoing} outgoing`);

    // Add each rule
    for (const rule of rules) {
        commands.push(generateRuleCommand(rule));
    }

    // Enable UFW (non-interactive)
    commands.push("echo 'y' | ufw enable");

    return commands;
}

/**
 * Sets up UFW firewall on Linux
 *
 * - Configures default deny incoming, allow outgoing
 * - Adds SSH rule with rate limiting
 */
export function setupFirewallLinux(options: SetupFirewallOptions = {}): SetupFirewallResult {
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
