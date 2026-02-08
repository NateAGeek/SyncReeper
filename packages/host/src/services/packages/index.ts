/**
 * Package installation service
 *
 * Installs all required packages for SyncReeper.
 *
 * Platform behavior:
 * - Linux: Uses apt-get + NVM for Node.js
 * - macOS: Uses Homebrew
 */

import { isLinux, isMacOS } from "@syncreeper/shared";
import { setupPackagesLinux } from "./linux";
import { setupPackagesDarwin } from "./darwin";
import type { SetupPackagesOptions, SetupPackagesResult } from "./types";

export type { SetupPackagesOptions, SetupPackagesResult } from "./types";

/**
 * Sets up all required packages for the current platform
 *
 * This installs:
 * - Security tools (firewall, sshguard)
 * - Syncthing for file sync
 * - Node.js for the sync application
 * - Git for repository operations
 */
export function setupPackages(options: SetupPackagesOptions = {}): SetupPackagesResult {
    if (isMacOS()) {
        return setupPackagesDarwin(options);
    }
    if (isLinux()) {
        return setupPackagesLinux(options);
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

// Re-export platform-specific functions for direct use when needed
export { setupPackagesLinux } from "./linux";
export { setupPackagesDarwin } from "./darwin";
