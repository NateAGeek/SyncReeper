/**
 * Passthrough Tunnel Service
 *
 * Creates a dedicated 'passthrough' user on the VPS and configures SSHD
 * to accept reverse SSH tunnels from the home machine (e.g., Mac Mini).
 *
 * This allows SSH access to the home machine from the VPS without
 * exposing any ports on the home network. The home machine initiates
 * an outbound SSH connection to the VPS with -R port forwarding,
 * and the VPS can then SSH into the home machine via localhost.
 *
 * Platform behavior:
 * - Linux: Full implementation (creates user, configures SSHD Match block)
 * - macOS: Not supported (passthrough is a VPS-side service)
 */

import { isLinux, isMacOS } from "@syncreeper/shared";
import { setupPassthroughLinux } from "./linux";
import type { SetupPassthroughOptions, SetupPassthroughResult } from "./types";

export type { SetupPassthroughOptions, SetupPassthroughResult } from "./types";
export { PASSTHROUGH_DEFAULTS } from "./types";

/**
 * Sets up the passthrough tunnel service for the current platform
 *
 * Only supported on Linux (VPS). On macOS, logs a message and returns
 * an empty result since the passthrough service is VPS-only.
 */
export function setupPassthrough(options: SetupPassthroughOptions): SetupPassthroughResult {
    if (isLinux()) {
        return setupPassthroughLinux(options);
    }
    if (isMacOS()) {
        console.log(
            "Passthrough tunnel service is not applicable on macOS. " +
                "This service runs on the VPS (Linux) to accept reverse SSH tunnels. " +
                "Use the @syncreeper/node-passthrough package on your Mac to set up the tunnel client."
        );
        return { resources: [] };
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

// Re-export platform-specific function for direct use when needed
export { setupPassthroughLinux } from "./linux";
