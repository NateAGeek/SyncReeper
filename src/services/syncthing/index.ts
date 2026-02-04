/**
 * Syncthing Service
 *
 * Configures Syncthing to sync repositories across devices.
 *
 * Platform behavior:
 * - Linux: Uses systemd syncthing@user service
 * - macOS: Uses Homebrew services (brew services)
 *
 * The GUI is only accessible via localhost on both platforms.
 * On Linux VPS, access via SSH tunnel.
 */

import { isLinux, isMacOS } from "../../lib/platform";
import { setupSyncthingLinux } from "./linux";
import { setupSyncthingDarwin } from "./darwin";
import type { SetupSyncthingOptions, SetupSyncthingResult } from "./types";

export type { SetupSyncthingOptions, SetupSyncthingResult } from "./types";

/**
 * Sets up Syncthing for the current platform
 *
 * - Generates keys and initial config
 * - Configures devices and folders via CLI
 * - Enables and starts the service
 * - Creates convenience script to get device ID
 */
export function setupSyncthing(options: SetupSyncthingOptions): SetupSyncthingResult {
    if (isMacOS()) {
        return setupSyncthingDarwin(options);
    }
    if (isLinux()) {
        return setupSyncthingLinux(options);
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

// Re-export platform-specific functions for direct use when needed
export { setupSyncthingLinux } from "./linux";
export { setupSyncthingDarwin } from "./darwin";
export { generateStignoreContent } from "./stignore";
