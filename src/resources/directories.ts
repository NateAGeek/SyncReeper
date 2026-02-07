/**
 * Creates required directories for SyncReeper
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../lib/command";
import { getPaths, getServiceUser } from "../config/types";

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
 */
export function createDirectories(options: CreateDirectoriesOptions): CreateDirectoriesResult {
    const { reposPath, dependsOn } = options;
    const { name: username } = getServiceUser();

    const createDirsCmd = runCommand({
        name: "create-directories",
        create: `
            # Create repos directory
            mkdir -p "${reposPath}"
            chown ${username}:${username} "${reposPath}"
            chmod 755 "${reposPath}"

            # Create sync app directory
            mkdir -p "${getPaths().syncApp}"
            chown root:root "${getPaths().syncApp}"
            chmod 755 "${getPaths().syncApp}"

            # Create syncthing config directory
            mkdir -p "${getPaths().syncthingConfig}"
            chown ${username}:${username} "${getPaths().syncthingConfig}"
            chmod 700 "${getPaths().syncthingConfig}"

            echo "Directories created successfully"
        `.trim(),
        delete: `
            rm -rf "${getPaths().syncApp}"
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
