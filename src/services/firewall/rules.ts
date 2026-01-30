/**
 * Firewall rule definitions for UFW
 * SyncReeper only exposes SSH (port 22) - everything else is blocked
 * Syncthing is accessed via SSH tunnel, not directly exposed
 */

/**
 * Defines a UFW firewall rule
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
 * Default firewall rules for SyncReeper
 *
 * Security model:
 * - Default deny incoming
 * - Allow outgoing (for apt, git, syncthing relay)
 * - Only SSH (22) is exposed, with rate limiting
 * - Syncthing GUI/API accessed via SSH tunnel
 * - Syncthing sync uses relay servers (outbound connections only)
 */
export const DEFAULT_FIREWALL_RULES: FirewallRule[] = [
    {
        description: "Allow SSH with rate limiting (6 connections per 30 seconds)",
        port: "22",
        proto: "tcp",
        action: "allow",
        direction: "in",
        limit: true,
    },
];

/**
 * UFW default policies
 */
export const UFW_POLICIES = {
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
export function generateFirewallCommands(rules: FirewallRule[] = DEFAULT_FIREWALL_RULES): string[] {
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
