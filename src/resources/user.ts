/**
 * Creates the syncreeper service user
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../lib/command.js";
import { SERVICE_USER } from "../config/types.js";

export interface CreateServiceUserResult {
    /** The command resource that created the user */
    resource: pulumi.Resource;
    /** The username */
    username: string;
    /** The user's home directory */
    homeDir: string;
}

/**
 * Creates a dedicated system user for running SyncReeper services
 * - Syncthing runs as this user
 * - GitHub sync runs as this user
 * - Owns /srv/repos directory
 */
export function createServiceUser(): CreateServiceUserResult {
    const { name, home, shell } = SERVICE_USER;

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
