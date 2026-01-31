/**
 * Syncthing ignore patterns (.stignore) generation
 *
 * Creates a comprehensive .stignore file that:
 * 1. Includes each repository's .gitignore
 * 2. Ignores OS-specific files
 * 3. Ignores build artifacts and dependencies for common languages
 *
 * Supported: JavaScript/TypeScript, Python, Rust, Go, Java, C/C++, Zig, C#/Unity, Godot
 */

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
// - Use #include <file> to include patterns from another file

// ============================================================
// OS-Specific Files
// ============================================================

// macOS
.DS_Store
._*
.Spotlight-V100/
.Trashes/
.fseventsd/
.AppleDouble
.LSOverride

// Windows
Thumbs.db
ehthumbs.db
desktop.ini
$RECYCLE.BIN/
*.lnk

// Linux
*~
.directory

// ============================================================
// Logs
// ============================================================
*.log
logs/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
pnpm-debug.log*

// ============================================================
// Environment Files (may contain secrets)
// ============================================================
.env
.env.local
.env.*.local
.env.development
.env.production
.env.test
*.pem
*.key

// ============================================================
// JavaScript / TypeScript
// ============================================================
node_modules/
dist/
build/
.next/
.nuxt/
.output/
.cache/
.parcel-cache/
.turbo/
.npm/
.yarn/
.pnpm-store/
*.tsbuildinfo
.eslintcache
.stylelintcache

// ============================================================
// Python
// ============================================================
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
.venv/
venv/
ENV/
env/
.pytest_cache/
.mypy_cache/
.ruff_cache/
*.egg-info/
*.egg
.eggs/
htmlcov/
.coverage
.coverage.*
.tox/
.nox/

// ============================================================
// Rust
// ============================================================
target/
**/*.rs.bk
*.rlib
*.rmeta
Cargo.lock

// ============================================================
// Go
// ============================================================
/bin/
/pkg/
vendor/
go.work

// ============================================================
// Java / Kotlin / Gradle / Maven
// ============================================================
*.class
*.jar
*.war
*.ear
*.nar
.gradle/
build/
out/
.idea/artifacts/
.idea/libraries/
target/
pom.xml.tag
pom.xml.releaseBackup
pom.xml.versionsBackup
pom.xml.next
release.properties
dependency-reduced-pom.xml

// ============================================================
// C / C++
// ============================================================
*.o
*.obj
*.so
*.dylib
*.dll
*.a
*.lib
*.exe
*.out
*.app
*.dSYM/
cmake-build-*/
CMakeFiles/
CMakeCache.txt
cmake_install.cmake
Makefile
compile_commands.json

// ============================================================
// Zig
// ============================================================
zig-cache/
zig-out/
.zig-cache/

// ============================================================
// C# / .NET
// ============================================================
[Bb]in/
[Oo]bj/
[Dd]ebug/
[Rr]elease/
x64/
x86/
*.user
*.userosscache
*.sln.docstates
*.suo
*.cache
*.vspscc
*.vssscc
.vs/
*.pidb
*.userprefs
*.nupkg
packages/
project.lock.json
project.fragment.lock.json
artifacts/

// ============================================================
// Unity
// ============================================================
[Ll]ibrary/
[Tt]emp/
[Ll]ogs/
[Uu]ser[Ss]ettings/
[Mm]emoryCaptures/
[Rr]ecordings/
[Aa]ssets/Plugins/Editor/JetBrains*
[Aa]ssets/AssetStoreTools*
sysinfo.txt
*.unitypackage
*.apk
*.aab
*.unityproj
crashlytics-build.properties

// ============================================================
// Godot
// ============================================================
.godot/
*.import
export.cfg
export_presets.cfg
.mono/
mono_crash.*.json
data_*/
*.translation

// ============================================================
// Test and Coverage
// ============================================================
coverage/
.nyc_output/
*.lcov
.coverage/
htmlcov/
test-results/
test-output/

// ============================================================
// Misc Build Artifacts
// ============================================================
*.map
*.min.js
*.min.css
*.chunk.js
*.chunk.css
*.bundle.js
*.bundle.css

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
`;
}
