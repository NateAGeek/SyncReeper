/**
 * Linux user resource
 *
 * Creates a dedicated system user for running SyncReeper services on Linux.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../lib/command";
import { SERVICE_USER_LINUX } from "../config/paths.linux";

export interface CreateServiceUserLinuxResult {
    /** The command resource that created the user */
    resource: pulumi.Resource;
    /** The username */
    username: string;
    /** The user's home directory */
    homeDir: string;
}

/**
 * Creates a dedicated system user for running SyncReeper services on Linux
 * - Syncthing runs as this user
 * - GitHub sync runs as this user
 * - Owns /srv/repos directory
 */
export function createServiceUserLinux(): CreateServiceUserLinuxResult {
    const { name, home, shell } = SERVICE_USER_LINUX;

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
