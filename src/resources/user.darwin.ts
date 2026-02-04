/**
 * macOS user resource
 *
 * On macOS, we run as the current user (no dedicated system user).
 * This provides a no-op implementation that returns the current user info.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../lib/command";
import { getServiceUserDarwin } from "../config/paths.darwin";

export interface CreateServiceUserDarwinResult {
    /** The command resource (no-op on macOS) */
    resource: pulumi.Resource;
    /** The username (current user) */
    username: string;
    /** The user's home directory */
    homeDir: string;
}

/**
 * "Creates" the service user on macOS
 *
 * This is a no-op since we use the current user on macOS.
 * Returns information about the current user for consistency with the Linux API.
 */
export function createServiceUserDarwin(): CreateServiceUserDarwinResult {
    const serviceUser = getServiceUserDarwin();

    // No-op command - just log that we're using the current user
    const noopCmd = runCommand({
        name: "macos-user-check",
        create: `echo "Using current user '${serviceUser.name}' for SyncReeper services"`,
    });

    return {
        resource: noopCmd,
        username: serviceUser.name,
        homeDir: serviceUser.home,
    };
}
