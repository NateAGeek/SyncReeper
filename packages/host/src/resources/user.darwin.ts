/**
 * macOS user resource
 *
 * On macOS, we use an existing user (no dedicated system user is created).
 * The username is configurable via the `syncreeper:service-user` Pulumi config key.
 * When set, the specified user must already exist on the system.
 * When not set, defaults to the current logged-in user.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../lib/command";
import { getServiceUser } from "../config/types";

export interface CreateServiceUserDarwinResult {
    /** The command resource (validation on macOS) */
    resource: pulumi.Resource;
    /** The username */
    username: string;
    /** The user's home directory */
    homeDir: string;
}

/**
 * Validates the service user on macOS.
 *
 * Unlike Linux, macOS does not create a new system user.
 * Instead, it verifies the configured user exists on the system.
 */
export function createServiceUserDarwin(): CreateServiceUserDarwinResult {
    const serviceUser = getServiceUser();

    // Verify the user exists on macOS (users must already exist)
    const verifyUserCmd = runCommand({
        name: "macos-user-check",
        create: `
            if id "${serviceUser.name}" &>/dev/null; then
                echo "Using existing user '${serviceUser.name}' for SyncReeper services"
            else
                echo "Error: User '${serviceUser.name}' does not exist on this system." >&2
                echo "On macOS, the service user must already exist." >&2
                echo "Either create the user or set 'syncreeper:service-user' to an existing user." >&2
                exit 1
            fi
        `.trim(),
    });

    return {
        resource: verifyUserCmd,
        username: serviceUser.name,
        homeDir: serviceUser.home,
    };
}
