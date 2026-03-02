/**
 * Syncthing ignore patterns (.stignore) generation
 *
 * Creates a comprehensive .stignore file that:
 * 1. Ignores OS-specific files (with (?d) prefix for auto-deletion)
 * 2. Ignores build artifacts and dependencies for common languages
 * 3. Provides a marker section for per-repo .gitignore patterns
 *    (populated dynamically by the sync script)
 *
 * All directory patterns use the double-star prefix for explicit recursive
 * matching and omit trailing slashes so both the directory and its contents
 * are matched.
 *
 * Supported: JavaScript/TypeScript, Python, Rust, Go, Java, C/C++, Zig, C#/Unity, Godot
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Marker comments used to delimit the auto-generated .gitignore section */
export const GITIGNORE_SECTION_START = "// AUTO-GENERATED GITIGNORE PATTERNS";
export const GITIGNORE_SECTION_END = "// END AUTO-GENERATED GITIGNORE PATTERNS";

/**
 * Generates the content for the .stignore file
 * This file is placed at the root of the synced folder (/srv/repos/.stignore)
 */
export function generateStignoreContent(): string {
    return `// SyncReeper Syncthing Ignore Patterns
// This file controls which files are NOT synced across devices
// Edit this file to customize. Changes take effect immediately.
//
// Syntax: https://docs.syncthing.net/users/ignoring.html
// - Use // for comments
// - Use ! to negate (include) a pattern
// - Use ** for recursive matching
// - Patterns without a leading / match at any depth
// - (?d) prefix allows deletion of ignored files blocking directory removal

// ============================================================
// OS-Specific Files
// ============================================================

// macOS
(?d)**/.DS_Store
(?d)**/._*
(?d)**/.Spotlight-V100
(?d)**/.Trashes
(?d)**/.fseventsd
(?d)**/.AppleDouble
(?d)**/.LSOverride

// Windows
(?d)**/Thumbs.db
(?d)**/ehthumbs.db
(?d)**/desktop.ini
(?d)**/$RECYCLE.BIN
(?d)**/*.lnk

// Linux
(?d)**/*~
(?d)**/.directory

// ============================================================
// Logs
// ============================================================
(?d)**/*.log
(?d)**/logs
(?d)**/npm-debug.log*
(?d)**/yarn-debug.log*
(?d)**/yarn-error.log*
(?d)**/lerna-debug.log*
(?d)**/pnpm-debug.log*

// ============================================================
// Environment Files (may contain secrets)
// ============================================================
**/.env
**/.env.local
**/.env.*.local
**/.env.development
**/.env.production
**/.env.test
**/*.pem
**/*.key

// ============================================================
// JavaScript / TypeScript
// ============================================================
**/node_modules
**/dist                    // Also: Python sdist/bdist output
**/build                   // Also: Gradle, CMake, Python setuptools
**/.next
**/.nuxt
**/.output
**/.cache                  // Also: Parcel, Snowpack
**/.parcel-cache
**/.turbo
**/.npm
**/.yarn
**/.pnpm-store
**/*.tsbuildinfo
**/.eslintcache
**/.stylelintcache

// ============================================================
// Python
// ============================================================
**/__pycache__
**/*.py[cod]
**/*$py.class
**/*.so
**/.Python
**/.venv
**/venv
**/ENV
**/.pytest_cache
**/.mypy_cache
**/.ruff_cache
**/*.egg-info
**/*.egg
**/.eggs
**/htmlcov
**/.coverage
**/.coverage.*
**/.tox
**/.nox

// ============================================================
// Rust
// ============================================================
**/target                  // Also: Maven, sbt, Clojure Leiningen
**/*.rs.bk
**/*.rlib
**/*.rmeta
**/Cargo.lock

// ============================================================
// Go
// ============================================================
**/vendor                  // Also: PHP Composer, Ruby Bundler
**/go.work

// ============================================================
// Java / Kotlin / Gradle / Maven
// ============================================================
**/*.class
**/*.jar
**/*.war
**/*.ear
**/*.nar
**/.gradle
**/out                     // Also: TypeScript outDir, VS Code extensions
**/.idea/artifacts
**/.idea/libraries
**/pom.xml.tag
**/pom.xml.releaseBackup
**/pom.xml.versionsBackup
**/pom.xml.next
**/release.properties
**/dependency-reduced-pom.xml

// ============================================================
// C / C++
// ============================================================
**/*.o
**/*.obj
**/*.dylib
**/*.dll
**/*.a
**/*.lib
**/*.exe
**/*.out
**/*.app
**/*.dSYM
**/cmake-build-*
**/CMakeFiles
**/CMakeCache.txt
**/cmake_install.cmake
**/compile_commands.json

// ============================================================
// Zig
// ============================================================
**/zig-cache
**/zig-out
**/.zig-cache

// ============================================================
// C# / .NET
// ============================================================
// Note: **/[Dd]ebug, **/[Rr]elease, and **/packages are intentionally
// omitted here — they conflict with other ecosystems (PNPM workspaces,
// CMake configs, Electron, etc.). Per-repo .gitignore inlining handles
// these for actual .NET projects.
**/[Bb]in
**/[Oo]bj
**/x64
**/x86
**/*.user
**/*.userosscache
**/*.sln.docstates
**/*.suo
**/*.cache
**/*.vspscc
**/*.vssscc
**/.vs
**/*.pidb
**/*.userprefs
**/*.nupkg
**/project.lock.json
**/project.fragment.lock.json
**/artifacts

// ============================================================
// Unity
// ============================================================
**/[Ll]ibrary
**/[Tt]emp
(?d)**/[Ll]ogs
**/[Uu]ser[Ss]ettings
**/[Mm]emoryCaptures
**/[Rr]ecordings
**/[Aa]ssets/Plugins/Editor/JetBrains*
**/[Aa]ssets/AssetStoreTools*
**/sysinfo.txt
**/*.unitypackage
**/*.apk
**/*.aab
**/*.unityproj
**/crashlytics-build.properties

// ============================================================
// Godot
// ============================================================
**/.godot
**/*.import
**/export.cfg
**/export_presets.cfg
**/.mono
**/mono_crash.*.json
**/data_*
**/*.translation

// ============================================================
// Test and Coverage
// ============================================================
**/coverage
**/.nyc_output
**/*.lcov
**/.coverage
**/htmlcov
**/test-results
**/test-output

// ============================================================
// Misc Build Artifacts
// ============================================================
**/*.map
**/*.min.js
**/*.min.css
**/*.chunk.js
**/*.chunk.css
**/*.bundle.js
**/*.bundle.css

// ============================================================
// Package Manager Locks (optional - uncomment to ignore)
// ============================================================
// package-lock.json
// yarn.lock
// pnpm-lock.yaml
// Gemfile.lock
// composer.lock
// Pipfile.lock
// poetry.lock

// ============================================================
// Per-Repository .gitignore Patterns
// ============================================================
// The section below is automatically managed by the sync script.
// It inlines patterns from each repository's .gitignore file,
// scoped to their directory path. Do not edit manually.

${GITIGNORE_SECTION_START}
${GITIGNORE_SECTION_END}
`;
}

// ============================================================
// .gitignore conversion and stignore regeneration utilities
// ============================================================

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
export function convertGitignoreLine(line: string, repoRelPath: string): string {
    const trimmed = line.trim();
    if (trimmed === "") {
        return "";
    }

    if (trimmed.startsWith("#")) {
        return `// ${trimmed.slice(1).trim()}`;
    }

    let pattern = trimmed;
    let prefix = "";

    if (pattern.startsWith("!")) {
        prefix = "!";
        pattern = pattern.slice(1);
    }

    if (pattern.startsWith("/")) {
        pattern = pattern.slice(1);
    }

    if (pattern.endsWith("/")) {
        pattern = pattern.slice(0, -1);
    }

    if (pattern === "") {
        return "";
    }

    return `${prefix}${repoRelPath}/${pattern}`;
}

/**
 * Reads a .gitignore file and converts all patterns to Syncthing-compatible
 * patterns scoped to the given repo path.
 *
 * Returns null if the file cannot be read.
 */
export function convertGitignoreFile(gitignorePath: string, repoRelPath: string): string[] | null {
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

    while (converted.length > 0 && converted[converted.length - 1] === "") {
        converted.pop();
    }

    return converted.length > 0 ? converted : null;
}

function isDirectory(p: string): boolean {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

/**
 * Finds all .gitignore files in the repos directory.
 * Scans at depth 2 (org/repo/.gitignore).
 *
 * Returns an array of { gitignorePath, repoRelPath } objects sorted by path.
 */
export function findGitignoreFiles(
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

    results.sort((a, b) => a.repoRelPath.localeCompare(b.repoRelPath));
    return results;
}

/**
 * Generates the auto-generated section content from all .gitignore files.
 */
export function generateGitignoreSection(reposPath: string): string {
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
        sections.push("");
    }

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
export function updateStignoreIncludes(reposPath: string): void {
    const stignorePath = path.join(reposPath, ".stignore");

    let stignoreContent: string;
    try {
        stignoreContent = fs.readFileSync(stignorePath, "utf-8");
    } catch {
        console.log("Warning: .stignore file not found, skipping gitignore pattern update");
        return;
    }

    const startIdx = stignoreContent.indexOf(GITIGNORE_SECTION_START);
    const endIdx = stignoreContent.indexOf(GITIGNORE_SECTION_END);

    if (startIdx === -1 || endIdx === -1) {
        console.log(
            "Warning: .stignore missing auto-generated section markers, skipping gitignore pattern update"
        );
        return;
    }

    const newSection = generateGitignoreSection(reposPath);

    const before = stignoreContent.slice(0, startIdx);
    const after = stignoreContent.slice(endIdx + GITIGNORE_SECTION_END.length);
    const updatedContent = before + newSection + after;

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

/**
 * Regenerates the .stignore file from scratch.
 *
 * Writes the full static template (from generateStignoreContent) and then
 * populates the auto-generated gitignore section with patterns from each
 * repository's .gitignore file.
 *
 * This is the equivalent of what `pulumi up` does for the initial write,
 * but can be run independently via the CLI or TUI.
 */
export function regenerateStignore(reposPath: string): void {
    const stignorePath = path.join(reposPath, ".stignore");

    const content = generateStignoreContent();

    try {
        fs.writeFileSync(stignorePath, content, "utf-8");
        console.log(`  Wrote .stignore to ${stignorePath}`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to write .stignore: ${msg}`);
    }

    updateStignoreIncludes(reposPath);
}
