/**
 * GitHub API client for fetching repositories
 */

import { Octokit } from "@octokit/rest";

export interface Repository {
    name: string;
    fullName: string;
    cloneUrl: string;
    sshUrl: string;
    isPrivate: boolean;
    isArchived: boolean;
    defaultBranch: string;
}

export interface GitHubClientOptions {
    token: string;
    username: string;
}

/**
 * Creates a GitHub client and fetches all non-archived repositories
 */
export async function fetchRepositories(options: GitHubClientOptions): Promise<Repository[]> {
    const { token, username } = options;

    const octokit = new Octokit({ auth: token });

    console.log(`Fetching repositories for user: ${username}`);

    const repositories: Repository[] = [];
    let archivedCount = 0;
    let privateCount = 0;

    // Fetch all repositories the user has access to (including private)
    // Using pagination to handle users with many repos
    //
    // Note: Fine-grained PATs (github_pat_*) only have access to repos
    // explicitly granted during token creation. If repos are missing,
    // check the token's repository permissions at:
    // https://github.com/settings/tokens
    for await (const response of octokit.paginate.iterator(octokit.repos.listForAuthenticatedUser, {
        visibility: "all",
        affiliation: "owner,collaborator,organization_member",
        per_page: 100,
        sort: "updated",
    })) {
        for (const repo of response.data) {
            // Skip archived repositories
            if (repo.archived) {
                archivedCount++;
                console.log(`  Skipping archived: ${repo.full_name}`);
                continue;
            }

            if (repo.private) {
                privateCount++;
            }

            repositories.push({
                name: repo.name,
                fullName: repo.full_name,
                cloneUrl: repo.clone_url!,
                sshUrl: repo.ssh_url!,
                isPrivate: repo.private,
                isArchived: repo.archived,
                defaultBranch: repo.default_branch ?? "main",
            });
        }
    }

    console.log(
        `Found ${repositories.length} non-archived repositories (${privateCount} private, ${archivedCount} archived skipped)`
    );
    return repositories;
}
