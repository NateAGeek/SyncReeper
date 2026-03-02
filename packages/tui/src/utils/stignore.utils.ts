/**
 * Stignore utilities for the TUI
 *
 * Resolves the repos path and runs .stignore regeneration.
 */

import * as os from "node:os";
import { execa } from "execa";
import { regenerateStignore } from "@syncreeper/shared";

/**
 * Resolves the repos path from Pulumi config or platform default.
 */
export async function resolveReposPath(): Promise<string> {
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

/**
 * Regenerates the .stignore file at the given repos path.
 * Throws on failure.
 */
export function runRegenerateStignore(reposPath: string): void {
    regenerateStignore(reposPath);
}
