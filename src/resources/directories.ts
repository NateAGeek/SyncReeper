/**
 * Creates required directories for SyncReeper
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../lib/command";
import { SERVICE_USER, PATHS } from "../config/types";

export interface CreateDirectoriesOptions {
    /** Path where repos will be stored */
    reposPath: string;
    /** Resources to depend on (e.g., user creation) */
    dependsOn?: pulumi.Resource[];
}

export interface CreateDirectoriesResult {
    /** The command resource that created the directories */
    resource: pulumi.Resource;
    /** Path to the repos directory */
    reposPath: string;
}

/**
 * Creates all required directories for SyncReeper
 * - /srv/repos - Where GitHub repos are cloned
 * - /opt/syncreeper/sync - Where the sync application is deployed
 * - /var/log/syncreeper - Log directory (though we use journald)
 */
export function createDirectories(options: CreateDirectoriesOptions): CreateDirectoriesResult {
    const { reposPath, dependsOn } = options;
    const { name: username } = SERVICE_USER;

    const createDirsCmd = runCommand({
        name: "create-directories",
        create: `
            # Create repos directory
            mkdir -p "${reposPath}"
            chown ${username}:${username} "${reposPath}"
            chmod 755 "${reposPath}"

            # Create sync app directory
            mkdir -p "${PATHS.syncApp}"
            chown root:root "${PATHS.syncApp}"
            chmod 755 "${PATHS.syncApp}"

            # Create syncthing config directory
            mkdir -p "${PATHS.syncthingConfig}"
            chown ${username}:${username} "${PATHS.syncthingConfig}"
            chmod 700 "${PATHS.syncthingConfig}"

            echo "Directories created successfully"
        `.trim(),
        delete: `
            rm -rf "${PATHS.syncApp}"
            # Don't delete repos or syncthing config on destroy - data preservation
            echo "Application directories removed (repos preserved)"
        `.trim(),
        dependsOn,
    });

    return {
        resource: createDirsCmd,
        reposPath,
    };
}
