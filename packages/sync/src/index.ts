/**
 * SyncReeper Sync Application
 *
 * Clones and syncs all non-archived GitHub repositories to a local directory.
 * Designed to run as a systemd timer/service on the VPS.
 *
 * Environment variables:
 * - GITHUB_TOKEN: GitHub personal access token with 'repo' scope
 * - GITHUB_USERNAME: GitHub username
 * - REPOS_PATH: Directory to store repositories (default: /srv/repos)
 */

import { fetchRepositories } from "./github.js";
import { syncAllRepositories, type SyncResult } from "./git.js";
import { acquireLock } from "./lock.js";

interface Config {
    githubToken: string;
    githubUsername: string;
    reposPath: string;
}

/**
 * Loads configuration from environment variables
 */
function loadConfig(): Config {
    const githubToken = process.env.GITHUB_TOKEN;
    const githubUsername = process.env.GITHUB_USERNAME;
    const reposPath = process.env.REPOS_PATH ?? "/srv/repos";

    if (!githubToken) {
        console.error("Error: GITHUB_TOKEN environment variable is required");
        process.exit(1);
    }

    if (!githubUsername) {
        console.error("Error: GITHUB_USERNAME environment variable is required");
        process.exit(1);
    }

    return { githubToken, githubUsername, reposPath };
}

/**
 * Prints a summary of sync results
 */
function printSummary(results: SyncResult[]): void {
    const cloned = results.filter((r) => r.action === "cloned").length;
    const updated = results.filter((r) => r.action === "updated").length;
    const unchanged = results.filter((r) => r.action === "unchanged").length;
    const errors = results.filter((r) => r.action === "error");

    console.log("\n=== Sync Summary ===");
    console.log(`Total repositories: ${results.length}`);
    console.log(`  Cloned: ${cloned}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Unchanged: ${unchanged}`);
    console.log(`  Errors: ${errors.length}`);

    if (errors.length > 0) {
        console.log("\nErrors:");
        for (const error of errors) {
            console.log(`  ${error.repository}: ${error.message}`);
        }
    }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    console.log("SyncReeper - GitHub Repository Sync");
    console.log(`Started at: ${new Date().toISOString()}\n`);

    // Load configuration
    const config = loadConfig();
    console.log(`Repos path: ${config.reposPath}`);
    console.log(`GitHub user: ${config.githubUsername}\n`);

    // Acquire lock to prevent concurrent runs
    const lock = await acquireLock({ lockDir: config.reposPath });
    if (!lock.acquired) {
        console.error(`Cannot acquire lock: ${lock.error}`);
        process.exit(1);
    }

    try {
        // Fetch repositories from GitHub
        const repositories = await fetchRepositories({
            token: config.githubToken,
            username: config.githubUsername,
        });

        if (repositories.length === 0) {
            console.log("No repositories to sync");
            return;
        }

        // Sync all repositories
        console.log(`\nSyncing ${repositories.length} repositories...\n`);
        const results = await syncAllRepositories(repositories, {
            reposPath: config.reposPath,
            token: config.githubToken,
        });

        // Print summary
        printSummary(results);

        // Exit with error if any repos failed
        const hasErrors = results.some((r) => r.action === "error");
        if (hasErrors) {
            process.exit(1);
        }
    } finally {
        // Always release lock
        await lock.release();
    }

    console.log(`\nCompleted at: ${new Date().toISOString()}`);
}

// Run main
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
