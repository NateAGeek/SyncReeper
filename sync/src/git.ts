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
    action: "cloned" | "updated" | "unchanged" | "error";
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

        // Fetch latest changes
        await git.fetch(["origin", repo.defaultBranch, "--depth=1"]);

        // Check if we're behind
        const status = await git.status();

        if (status.behind > 0) {
            // Reset to origin's HEAD
            await git.reset(["--hard", `origin/${repo.defaultBranch}`]);

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
