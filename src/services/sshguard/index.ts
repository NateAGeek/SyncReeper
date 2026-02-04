/**
 * SSHGuard service - Brute-force attack protection
 *
 * SSHGuard monitors auth logs and blocks IPs that show malicious behavior.
 *
 * Platform behavior:
 * - Linux: Uses systemd + UFW backend
 * - macOS: Uses brew services + pf backend
 */

import { isLinux, isMacOS } from "../../lib/platform";
import { setupSSHGuardLinux } from "./linux";
import { setupSSHGuardDarwin } from "./darwin";
import type { SetupSSHGuardOptions, SetupSSHGuardResult } from "./types";

export type { SetupSSHGuardOptions, SetupSSHGuardResult } from "./types";
export { SSHGUARD_CONFIG } from "./types";

/**
 * Sets up SSHGuard for the current platform
 *
 * - Configures with aggressive settings
 * - Integrates with platform firewall (UFW on Linux, pf on macOS)
 * - Enables and starts the service
 */
export function setupSSHGuard(options: SetupSSHGuardOptions = {}): SetupSSHGuardResult {
    if (isMacOS()) {
        return setupSSHGuardDarwin(options);
    }
    if (isLinux()) {
        return setupSSHGuardLinux(options);
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

// Re-export platform-specific functions for direct use when needed
export { setupSSHGuardLinux } from "./linux";
export { setupSSHGuardDarwin } from "./darwin";
