/**
 * Service user resource
 *
 * Creates/identifies the user account for running SyncReeper services.
 * The username is configurable via the `syncreeper:service-user` Pulumi config key.
 *
 * Platform behavior:
 * - Linux: Creates a dedicated system user (if it doesn't exist)
 * - macOS: Validates that the specified user exists (no user creation)
 */

import type * as pulumi from "@pulumi/pulumi";
import { isLinux, isMacOS } from "@syncreeper/shared";
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
 * - On Linux: Creates a dedicated system user (configured or default 'syncreeper')
 * - On macOS: Validates the configured (or current) user exists
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
