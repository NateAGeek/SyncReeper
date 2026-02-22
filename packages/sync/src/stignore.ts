/**
 * .stignore updater for per-repo .gitignore patterns
 *
 * After syncing repositories, this module scans for .gitignore files
 * and inlines their patterns into the .stignore file, scoped to each
 * repo's directory path.
 *
 * Because Syncthing's #include directive does not scope patterns to the
 * included file's directory (all patterns are relative to the sync root),
 * we read each .gitignore and prefix every pattern with the repo path.
 *
 * .gitignore comments (lines starting with #) are converted to Syncthing
 * comments (// prefix) to avoid being misinterpreted as directives.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const GITIGNORE_SECTION_START = "// AUTO-GENERATED GITIGNORE PATTERNS";
const GITIGNORE_SECTION_END = "// END AUTO-GENERATED GITIGNORE PATTERNS";

/**
 * Converts a single .gitignore pattern into a Syncthing-compatible pattern
 * scoped to the given repo path.
 *
 * Handles:
 * - Comment lines (# -> //)
 * - Empty / whitespace-only lines (preserved as blank)
 * - Negation patterns (! prefix moved after path prefix)
 * - Root-anchored patterns (leading / is relative to the repo)
 * - Trailing slashes removed (Syncthing matches dir+contents without slash)
 * - Regular patterns (prefixed with repo path)
 */
function convertGitignoreLine(line: string, repoRelPath: string): string {
    // Preserve empty lines as section separators
    const trimmed = line.trim();
    if (trimmed === "") {
        return "";
    }

    // Convert git comments to Syncthing comments
    if (trimmed.startsWith("#")) {
        return `// ${trimmed.slice(1).trim()}`;
    }

    let pattern = trimmed;
    let prefix = "";

    // Handle negation: !pattern -> !repoPath/pattern
    if (pattern.startsWith("!")) {
        prefix = "!";
        pattern = pattern.slice(1);
    }

    // Remove leading / (root-anchored in .gitignore means repo root)
    if (pattern.startsWith("/")) {
        pattern = pattern.slice(1);
    }

    // Remove trailing / (Syncthing matches dir+contents without it)
    if (pattern.endsWith("/")) {
        pattern = pattern.slice(0, -1);
    }

    // Skip empty patterns after stripping
    if (pattern === "") {
        return "";
    }

    // Prefix the pattern with the repo's relative path
    return `${prefix}${repoRelPath}/${pattern}`;
}

/**
 * Reads a .gitignore file and converts all patterns to Syncthing-compatible
 * patterns scoped to the given repo path.
 *
 * Returns null if the file cannot be read.
 */
function convertGitignoreFile(gitignorePath: string, repoRelPath: string): string[] | null {
    let content: string;
    try {
        content = fs.readFileSync(gitignorePath, "utf-8");
    } catch {
        return null;
    }

    const lines = content.split("\n");
    const converted: string[] = [];

    for (const line of lines) {
        converted.push(convertGitignoreLine(line, repoRelPath));
    }

    // Trim trailing empty lines
    while (converted.length > 0 && converted[converted.length - 1] === "") {
        converted.pop();
    }

    return converted.length > 0 ? converted : null;
}

/**
 * Finds all .gitignore files in the repos directory.
 * Scans at depth 2 (org/repo/.gitignore) and depth 3 for nested .gitignore files.
 *
 * Returns an array of { gitignorePath, repoRelPath } objects sorted by path.
 */
function findGitignoreFiles(
    reposPath: string
): Array<{ gitignorePath: string; repoRelPath: string }> {
    const results: Array<{ gitignorePath: string; repoRelPath: string }> = [];

    let orgDirs: string[];
    try {
        orgDirs = fs.readdirSync(reposPath);
    } catch {
        return results;
    }

    for (const org of orgDirs) {
        const orgPath = path.join(reposPath, org);
        if (!isDirectory(orgPath)) continue;

        let repoDirs: string[];
        try {
            repoDirs = fs.readdirSync(orgPath);
        } catch {
            continue;
        }

        for (const repo of repoDirs) {
            const repoPath = path.join(orgPath, repo);
            if (!isDirectory(repoPath)) continue;

            const gitignorePath = path.join(repoPath, ".gitignore");
            if (fs.existsSync(gitignorePath)) {
                results.push({
                    gitignorePath,
                    repoRelPath: `${org}/${repo}`,
                });
            }
        }
    }

    // Sort for deterministic output
    results.sort((a, b) => a.repoRelPath.localeCompare(b.repoRelPath));
    return results;
}

function isDirectory(p: string): boolean {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

/**
 * Generates the auto-generated section content from all .gitignore files.
 */
function generateGitignoreSection(reposPath: string): string {
    const gitignoreFiles = findGitignoreFiles(reposPath);

    if (gitignoreFiles.length === 0) {
        return `${GITIGNORE_SECTION_START}\n${GITIGNORE_SECTION_END}`;
    }

    const sections: string[] = [];
    sections.push(GITIGNORE_SECTION_START);

    for (const { gitignorePath, repoRelPath } of gitignoreFiles) {
        const converted = convertGitignoreFile(gitignorePath, repoRelPath);
        if (converted === null || converted.length === 0) continue;

        sections.push(`// --- ${repoRelPath}/.gitignore ---`);
        sections.push(...converted);
        sections.push(""); // blank line between repos
    }

    // Remove trailing blank line before the end marker
    if (sections[sections.length - 1] === "") {
        sections.pop();
    }

    sections.push(GITIGNORE_SECTION_END);
    return sections.join("\n");
}

/**
 * Updates the .stignore file's auto-generated section with inlined
 * .gitignore patterns from all synced repositories.
 *
 * If the .stignore file doesn't exist or doesn't contain the marker
 * comments, this function logs a warning and returns without changes.
 */
export async function updateStignoreIncludes(reposPath: string): Promise<void> {
    const stignorePath = path.join(reposPath, ".stignore");

    // Read existing .stignore
    let stignoreContent: string;
    try {
        stignoreContent = fs.readFileSync(stignorePath, "utf-8");
    } catch {
        console.log("Warning: .stignore file not found, skipping gitignore pattern update");
        return;
    }

    // Find the marker section
    const startIdx = stignoreContent.indexOf(GITIGNORE_SECTION_START);
    const endIdx = stignoreContent.indexOf(GITIGNORE_SECTION_END);

    if (startIdx === -1 || endIdx === -1) {
        console.log(
            "Warning: .stignore missing auto-generated section markers, skipping gitignore pattern update"
        );
        return;
    }

    // Generate new section content
    const newSection = generateGitignoreSection(reposPath);

    // Replace the section (from start marker through end marker)
    const before = stignoreContent.slice(0, startIdx);
    const after = stignoreContent.slice(endIdx + GITIGNORE_SECTION_END.length);
    const updatedContent = before + newSection + after;

    // Only write if content actually changed
    if (updatedContent === stignoreContent) {
        console.log("  .stignore gitignore patterns unchanged");
        return;
    }

    try {
        fs.writeFileSync(stignorePath, updatedContent, "utf-8");
        const gitignoreCount = findGitignoreFiles(reposPath).length;
        console.log(`  Updated .stignore with patterns from ${gitignoreCount} .gitignore files`);
    } catch (error) {
        console.error(
            `Warning: Failed to update .stignore: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}
