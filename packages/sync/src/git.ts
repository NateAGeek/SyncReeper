/**
 * Git operations for cloning and syncing repositories
 */

import { simpleGit, type SimpleGit, type SimpleGitOptions } from "simple-git";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Repository } from "./github.js";

export interface SyncOptions {
    /** Base directory where repos are stored */
    reposPath: string;
    /** GitHub token for HTTPS auth */
    token: string;
}

export interface SyncResult {
    repository: string;
    action: "cloned" | "updated" | "unchanged" | "skipped" | "error";
    message: string;
}

/**
 * Gets the local path for a repository
 * Organizes by owner/repo structure
 */
function getRepoLocalPath(reposPath: string, fullName: string): string {
    return path.join(reposPath, fullName);
}

/**
 * Constructs the authenticated HTTPS URL for cloning
 */
function getAuthenticatedUrl(cloneUrl: string, token: string): string {
    // Convert https://github.com/user/repo.git to https://token@github.com/user/repo.git
    const url = new URL(cloneUrl);
    url.username = token;
    return url.toString();
}

/**
 * Clones a repository if it doesn't exist locally
 */
async function cloneRepository(
    repo: Repository,
    localPath: string,
    token: string
): Promise<SyncResult> {
    const authUrl = getAuthenticatedUrl(repo.cloneUrl, token);

    // Ensure parent directory exists
    const parentDir = path.dirname(localPath);
    if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
    }

    const gitOptions: Partial<SimpleGitOptions> = {
        baseDir: parentDir,
        binary: "git",
        maxConcurrentProcesses: 1,
    };

    const git: SimpleGit = simpleGit(gitOptions);

    try {
        await git.clone(authUrl, localPath, ["--depth=1", "--single-branch"]);

        // Update remote URL to non-authenticated version for safety
        const repoGit = simpleGit(localPath);
        await repoGit.remote(["set-url", "origin", repo.cloneUrl]);

        return {
            repository: repo.fullName,
            action: "cloned",
            message: `Cloned successfully`,
        };
    } catch (error) {
        return {
            repository: repo.fullName,
            action: "error",
            message: `Clone failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Updates an existing repository with fetch and reset
 */
async function updateRepository(
    repo: Repository,
    localPath: string,
    token: string
): Promise<SyncResult> {
    const git: SimpleGit = simpleGit(localPath);

    try {
        // Temporarily set authenticated URL for fetch
        const authUrl = getAuthenticatedUrl(repo.cloneUrl, token);
        await git.remote(["set-url", "origin", authUrl]);

        // Fetch all remote refs instead of a specific branch.
        // The GitHub API reports a defaultBranch, but the local clone may
        // have been created with a different branch, or the remote's default
        // branch may have been renamed (e.g. master → main). Fetching all
        // refs avoids "couldn't find remote ref" errors.
        await git.fetch(["origin", "--depth=1"]);

        // Determine the branch to track: prefer the GitHub-reported default
        // branch, but fall back to whatever branch is currently checked out.
        let targetBranch = repo.defaultBranch;
        try {
            // Check if the expected remote branch exists
            await git.raw(["rev-parse", "--verify", `origin/${targetBranch}`]);
        } catch {
            // Remote branch not found - try the currently checked-out branch
            try {
                const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
                if (currentBranch && currentBranch !== "HEAD") {
                    targetBranch = currentBranch;
                }
            } catch {
                // Ignore - we'll try with the original targetBranch
            }
        }

        // Check if we're behind
        const status = await git.status();

        // Skip repos with local modifications to avoid destroying in-progress work.
        // Checks tracked file changes (modified, staged) and local commits ahead of origin.
        // Untracked files are ignored — they survive a hard reset.
        const isDirty = status.modified.length > 0 || status.staged.length > 0 || status.ahead > 0;

        if (isDirty) {
            // Restore non-authenticated URL before skipping
            await git.remote(["set-url", "origin", repo.cloneUrl]);

            const reasons: string[] = [];
            if (status.modified.length > 0)
                reasons.push(`${status.modified.length} modified file(s)`);
            if (status.staged.length > 0) reasons.push(`${status.staged.length} staged file(s)`);
            if (status.ahead > 0) reasons.push(`${status.ahead} local commit(s) ahead`);

            return {
                repository: repo.fullName,
                action: "skipped",
                message: `Skipped: local changes detected (${reasons.join(", ")})`,
            };
        }

        if (status.behind > 0) {
            // Reset to origin's HEAD
            await git.reset(["--hard", `origin/${targetBranch}`]);

            // Restore non-authenticated URL
            await git.remote(["set-url", "origin", repo.cloneUrl]);

            return {
                repository: repo.fullName,
                action: "updated",
                message: `Updated to latest (was ${status.behind} commits behind)`,
            };
        }

        // Restore non-authenticated URL
        await git.remote(["set-url", "origin", repo.cloneUrl]);

        return {
            repository: repo.fullName,
            action: "unchanged",
            message: "Already up to date",
        };
    } catch (error) {
        // Try to restore non-authenticated URL even on error
        try {
            await git.remote(["set-url", "origin", repo.cloneUrl]);
        } catch {
            // Ignore
        }

        return {
            repository: repo.fullName,
            action: "error",
            message: `Update failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Syncs a single repository (clone or update)
 */
export async function syncRepository(repo: Repository, options: SyncOptions): Promise<SyncResult> {
    const { reposPath, token } = options;
    const localPath = getRepoLocalPath(reposPath, repo.fullName);

    // Check if repo already exists locally
    const gitDir = path.join(localPath, ".git");
    if (fs.existsSync(gitDir)) {
        return updateRepository(repo, localPath, token);
    } else {
        return cloneRepository(repo, localPath, token);
    }
}

/**
 * Syncs all repositories sequentially
 */
export async function syncAllRepositories(
    repositories: Repository[],
    options: SyncOptions
): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const repo of repositories) {
        console.log(`Syncing: ${repo.fullName}...`);
        const result = await syncRepository(repo, options);
        results.push(result);
        console.log(`  ${result.action}: ${result.message}`);
    }

    return results;
}
