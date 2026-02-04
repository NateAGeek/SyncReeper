/**
 * Service user resource
 *
 * Creates/identifies the user account for running SyncReeper services.
 *
 * Platform behavior:
 * - Linux: Creates a dedicated 'syncreeper' system user
 * - macOS: Uses the current user (no dedicated user needed)
 */

import type * as pulumi from "@pulumi/pulumi";
import { isLinux, isMacOS } from "../lib/platform";
import { createServiceUserLinux } from "./user.linux";
import { createServiceUserDarwin } from "./user.darwin";

export interface CreateServiceUserResult {
    /** The command resource that created/verified the user */
    resource: pulumi.Resource;
    /** The username */
    username: string;
    /** The user's home directory */
    homeDir: string;
}

/**
 * Creates/identifies the service user for the current platform
 *
 * - On Linux: Creates a dedicated 'syncreeper' system user
 * - On macOS: Uses the current logged-in user (no-op)
 */
export function createServiceUser(): CreateServiceUserResult {
    if (isMacOS()) {
        return createServiceUserDarwin();
    }
    if (isLinux()) {
        return createServiceUserLinux();
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

// Re-export platform-specific functions for direct use when needed
export { createServiceUserLinux } from "./user.linux";
export { createServiceUserDarwin } from "./user.darwin";
export type { CreateServiceUserLinuxResult } from "./user.linux";
export type { CreateServiceUserDarwinResult } from "./user.darwin";
