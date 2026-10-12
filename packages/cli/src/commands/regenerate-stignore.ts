/**
 * regenerate-stignore command - Regenerate the Syncthing .stignore file
 *
 * Writes a fresh .stignore template with all static ignore patterns,
 * then populates the auto-generated section with per-repo .gitignore
 * patterns. This is equivalent to what `pulumi up` does but can be
 * run independently without a full redeployment.
 */

import * as os from "node:os";
import * as fs from "node:fs";
import type { CommandModule } from "yargs";
import { execa } from "execa";
import { regenerateStignore } from "@syncreeper/shared";

/**
 * Resolves the repos path from:
 * 1. Explicit --repos-path flag
 * 2. Pulumi config (syncreeper:repos-path)
 * 3. Platform default
 */
async function resolveReposPath(explicit?: string): Promise<string> {
    if (explicit) return explicit;

    try {
        const result = await execa("pulumi", ["config", "get", "syncreeper:repos-path"], {
            reject: false,
        });
        if (result.exitCode === 0 && result.stdout.trim()) {
            return result.stdout.trim();
        }
    } catch {
        // Fall through to platform default
    }

    if (process.platform === "darwin") {
        return `${os.homedir()}/SyncReeper/repos`;
    }
    return "/srv/repos";
}

export const regenerateStignoreCommand: CommandModule = {
    command: "regenerate-stignore",
    describe: "Regenerate the Syncthing .stignore file from the latest template",
    builder: (yargs) =>
        yargs
            .option("repos-path", {
                type: "string",
                description:
                    "Path to the repos directory (default: from Pulumi config or platform default)",
            })
            .example(
                "$0 regenerate-stignore",
                "Regenerate using repos path from Pulumi config or platform default"
            )
            .example(
                "$0 regenerate-stignore --repos-path /srv/repos",
                "Regenerate with explicit repos path"
            ),
    handler: async (argv) => {
        const reposPath = await resolveReposPath(argv["repos-path"] as string | undefined);

        console.log("\nRegenerate .stignore\n");
        console.log(`Repos path: ${reposPath}`);

        // Verify the repos directory exists
        if (!fs.existsSync(reposPath)) {
            console.error(`\nError: Repos directory does not exist: ${reposPath}`);
            console.error("Make sure SyncReeper has been deployed (pulumi up) first.");
            process.exit(1);
        }

        try {
            regenerateStignore(reposPath);
            console.log("\n.stignore regenerated successfully!\n");
        } catch (error) {
            console.error(
                `\nFailed to regenerate .stignore: ${error instanceof Error ? error.message : String(error)}`
            );
            process.exit(1);
        }
    },
};
