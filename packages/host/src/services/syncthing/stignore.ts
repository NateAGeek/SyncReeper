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
**/dist
**/build
**/.next
**/.nuxt
**/.output
**/.cache
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
**/target
**/*.rs.bk
**/*.rlib
**/*.rmeta
**/Cargo.lock

// ============================================================
// Go
// ============================================================
**/vendor
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
**/out
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
**/[Bb]in
**/[Oo]bj
**/[Dd]ebug
**/[Rr]elease
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
**/packages
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
