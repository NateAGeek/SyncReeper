/**
 * Firewall service
 *
 * Configures the firewall for SyncReeper.
 *
 * Platform behavior:
 * - Linux: Uses UFW (Uncomplicated Firewall)
 * - macOS: Uses pf (Packet Filter)
 *
 * Security approach:
 * - Default deny incoming, allow outgoing
 * - Only SSH (port 22) is exposed with rate limiting
 * - Syncthing communicates via relay servers (outbound)
 * - Syncthing GUI accessed via SSH tunnel
 */

import { isLinux, isMacOS } from "@syncreeper/shared";
import { setupFirewallLinux } from "./linux";
import { setupFirewallDarwin } from "./darwin";
import type { SetupFirewallOptions, SetupFirewallResult } from "./types";

export type { SetupFirewallOptions, SetupFirewallResult, FirewallRule } from "./types";
export { DEFAULT_FIREWALL_RULES } from "./types";

/**
 * Sets up the firewall for the current platform
 *
 * - Configures default deny incoming, allow outgoing
 * - Adds SSH rule with rate limiting
 */
export function setupFirewall(options: SetupFirewallOptions = {}): SetupFirewallResult {
    if (isMacOS()) {
        return setupFirewallDarwin(options);
    }
    if (isLinux()) {
        return setupFirewallLinux(options);
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

// Re-export platform-specific functions for direct use when needed
export { setupFirewallLinux } from "./linux";
export { setupFirewallDarwin } from "./darwin";
