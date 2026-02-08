/**
 * GitHub Sync Service
 *
 * Deploys the sync application and sets up periodic synchronization.
 *
 * Platform behavior:
 * - Linux: Uses systemd service and timer
 * - macOS: Uses launchd plist with StartCalendarInterval
 */

import { isLinux, isMacOS } from "@syncreeper/shared";
import { setupGitHubSyncLinux } from "./linux";
import { setupGitHubSyncDarwin } from "./darwin";
import type { SetupGitHubSyncOptions, SetupGitHubSyncResult } from "./types";

export type { SetupGitHubSyncOptions, SetupGitHubSyncResult } from "./types";

/**
 * Sets up the GitHub sync service for the current platform
 *
 * - Deploys the sync application bundle
 * - Creates environment file with secrets
 * - Sets up periodic execution via systemd timer (Linux) or launchd (macOS)
 * - Creates convenience script for manual sync
 */
export function setupGitHubSync(options: SetupGitHubSyncOptions): SetupGitHubSyncResult {
    if (isMacOS()) {
        return setupGitHubSyncDarwin(options);
    }
    if (isLinux()) {
        return setupGitHubSyncLinux(options);
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

// Re-export platform-specific functions for direct use when needed
export { setupGitHubSyncLinux } from "./linux";
export { setupGitHubSyncDarwin } from "./darwin";
