/**
 * Auto-updates service - Automatic security updates
 *
 * Platform behavior:
 * - Linux: Configures unattended-upgrades for automatic security updates
 * - macOS: No-op (macOS handles its own updates via System Preferences)
 */

import { isLinux, isMacOS } from "@syncreeper/shared";
import { setupAutoUpdatesLinux } from "./linux";
import { setupAutoUpdatesDarwin } from "./darwin";
import type { SetupAutoUpdatesOptions, SetupAutoUpdatesResult } from "./types";

export type { SetupAutoUpdatesOptions, SetupAutoUpdatesResult } from "./types";

/**
 * Sets up automatic security updates for the current platform
 *
 * - Linux: Configures unattended-upgrades
 * - macOS: Logs info message (no-op, macOS handles its own updates)
 */
export function setupAutoUpdates(options: SetupAutoUpdatesOptions = {}): SetupAutoUpdatesResult {
    if (isMacOS()) {
        return setupAutoUpdatesDarwin(options);
    }
    if (isLinux()) {
        return setupAutoUpdatesLinux(options);
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

// Re-export platform-specific functions for direct use when needed
export { setupAutoUpdatesLinux } from "./linux";
export { setupAutoUpdatesDarwin } from "./darwin";
