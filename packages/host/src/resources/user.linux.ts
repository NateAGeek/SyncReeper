/**
 * Linux user resource
 *
 * Creates a dedicated system user for running SyncReeper services on Linux.
 * The username is configurable via the `syncreeper:service-user` Pulumi config key.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../lib/command";
import { getServiceUser } from "../config/types";

export interface CreateServiceUserLinuxResult {
    /** The command resource that created the user */
    resource: pulumi.Resource;
    /** The username */
    username: string;
    /** The user's home directory */
    homeDir: string;
}

/**
 * Creates a dedicated system user for running SyncReeper services on Linux.
 * If the user already exists, this is a no-op.
 *
 * - Syncthing runs as this user
 * - GitHub sync runs as this user
 * - Owns /srv/repos directory
 */
export function createServiceUserLinux(): CreateServiceUserLinuxResult {
    const { name, home, shell } = getServiceUser();

    const createUserCmd = runCommand({
        name: "create-service-user",
        create: `
            if ! id "${name}" &>/dev/null; then
                useradd --system --create-home --home-dir "${home}" --shell "${shell}" "${name}"
                echo "User ${name} created"
            else
                echo "User ${name} already exists"
            fi
        `.trim(),
        delete: `
            userdel -r "${name}" || true
        `.trim(),
    });

    return {
        resource: createUserCmd,
        username: name,
        homeDir: home,
    };
}
