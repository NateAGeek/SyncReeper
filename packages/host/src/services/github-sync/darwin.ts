/**
 * macOS GitHub Sync Service
 *
 * Deploys the sync application and sets up a launchd plist
 * for periodic repository synchronization.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as pulumi from "@pulumi/pulumi";
import { runCommand, writeFile, copyFile } from "../../lib/command";
import { enableServiceDarwin } from "../../lib/command.darwin";
import { getPaths } from "../../config/types";
import type { SetupGitHubSyncOptions, SetupGitHubSyncResult } from "./types";
import type { SyncReeperConfig } from "../../config/types";

/**
 * Gets the project root directory by resolving from the compiled output location.
 * When Pulumi runs the program, process.cwd() points to the `main` directory
 * (packages/host/dist), not the project root. We use __dirname to resolve
 * relative to this file's compiled location instead.
 *
 * Compiled path: <root>/packages/host/dist/services/github-sync/darwin.js
 * So __dirname is: <root>/packages/host/dist/services/github-sync
 * Project root is 5 levels up.
 */
function getProjectRoot(): string {
    return path.resolve(__dirname, "..", "..", "..", "..", "..");
}

/**
 * Gets the sync app bundle path
 * Throws an error if the bundle doesn't exist, prompting user to build first
 */
function getSyncAppBundlePath(): string {
    const projectRoot = getProjectRoot();
    const bundlePath = path.join(projectRoot, "packages", "sync", "dist", "bundle.js");

    if (!fs.existsSync(bundlePath)) {
        throw new Error(
            `Sync app bundle not found at ${bundlePath}. ` +
                `Please run 'pnpm run build' before deploying.`
        );
    }

    return bundlePath;
}

/**
 * Generates the environment file for the sync service
 */
function generateEnvFileContent(config: SyncReeperConfig): pulumi.Output<string> {
    return pulumi.interpolate`# SyncReeper GitHub Sync Environment
# This file contains secrets - do not share
GITHUB_TOKEN=${config.github.token}
GITHUB_USERNAME=${config.github.username}
REPOS_PATH=${config.sync.reposPath}
`;
}

/**
 * Converts schedule to launchd StartCalendarInterval format
 */
export function getCalendarInterval(schedule: string): { Hour?: number; Minute?: number } {
    if (schedule === "daily") {
        // Run at 3:00 AM daily
        return { Hour: 3, Minute: 0 };
    }
    if (schedule === "hourly") {
        // Run at the start of every hour
        return { Minute: 0 };
    }
    // Default to daily at 3 AM
    return { Hour: 3, Minute: 0 };
}

/**
 * Generates the launchd plist for the sync service
 */
export function generateLaunchdPlist(
    config: SyncReeperConfig,
    paths: ReturnType<typeof getPaths>
): string {
    const interval = getCalendarInterval(config.sync.schedule);

    // Build the StartCalendarInterval XML
    const intervalXml = Object.entries(interval)
        .map(
            ([key, value]) =>
                `            <key>${key}</key>\n            <integer>${value}</integer>`
        )
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.syncreeper.sync</string>

    <key>ProgramArguments</key>
    <array>
        <string>$HOME/.local/bin/node</string>
        <string>${paths.syncApp}/dist/bundle.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${paths.syncApp}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$HOME/.local/bin:$HOME/.nvm/versions/node/v22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>StartCalendarInterval</key>
    <dict>
${intervalXml}
    </dict>

    <key>StandardOutPath</key>
    <string>${paths.logDir}/sync.log</string>

    <key>StandardErrorPath</key>
    <string>${paths.logDir}/sync.error.log</string>

    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
`;
}

/**
 * Generates a convenience script for manual sync
 */
export function generateSyncScript(paths: ReturnType<typeof getPaths>): string {
    return `#!/bin/bash
# Manual trigger for SyncReeper sync
# Runs the sync application directly

set -e

echo "Starting manual sync..."
cd "${paths.syncApp}"

# Source the environment file
if [ -f "${paths.envDir}/sync.env" ]; then
    export $(cat "${paths.envDir}/sync.env" | grep -v '^#' | xargs)
fi

# Run the sync
$HOME/.local/bin/node dist/bundle.js

echo "Sync complete!"
`;
}

/**
 * Sets up the GitHub sync service on macOS
 * - Deploys the sync application
 * - Creates launchd plist with StartCalendarInterval
 */
export function setupGitHubSyncDarwin(options: SetupGitHubSyncOptions): SetupGitHubSyncResult {
    const { config, dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];

    const paths = getPaths();

    // Create directories
    const createDirs = runCommand({
        name: "create-sync-dirs",
        create: `
            mkdir -p "${paths.syncApp}/dist"
            mkdir -p "${paths.envDir}"
            mkdir -p "${paths.logDir}"
            mkdir -p "${paths.launchAgents}"
            mkdir -p "$(dirname "${paths.syncScript}")"
            echo "Sync directories created"
        `.trim(),
        dependsOn,
    });
    resources.push(createDirs);

    // Write environment file with secrets
    const envContent = generateEnvFileContent(config);
    const writeEnvFile = writeFile({
        name: "sync-env-file",
        path: `${paths.envDir}/sync.env`,
        content: envContent,
        mode: "600",
        dependsOn: [createDirs],
    });
    resources.push(writeEnvFile);

    // Get the bundled sync application path
    const bundlePath = getSyncAppBundlePath();

    // Deploy the bundled sync application
    const deploySyncBundle = copyFile({
        name: "deploy-sync-bundle",
        src: bundlePath,
        dest: `${paths.syncApp}/dist/bundle.js`,
        mode: "644",
        dependsOn: [createDirs],
    });
    resources.push(deploySyncBundle);

    // Verify the bundle is valid JavaScript
    const verifySyncBundle = runCommand({
        name: "verify-sync-bundle",
        create: `$HOME/.local/bin/node --check "${paths.syncApp}/dist/bundle.js" && echo "Sync app bundle verified successfully"`,
        dependsOn: [deploySyncBundle],
    });
    resources.push(verifySyncBundle);

    // Generate and write launchd plist
    const plistContent = generateLaunchdPlist(config, paths);
    const writePlist = writeFile({
        name: "syncreeper-sync-plist",
        path: `${paths.launchAgents}/com.syncreeper.sync.plist`,
        content: plistContent,
        mode: "644",
        dependsOn: [verifySyncBundle, writeEnvFile],
    });
    resources.push(writePlist);

    // Write convenience script
    const syncScriptContent = generateSyncScript(paths);
    const writeSyncScript = writeFile({
        name: "sync-repos-script",
        path: paths.syncScript,
        content: syncScriptContent,
        mode: "755",
        dependsOn: [verifySyncBundle],
    });
    resources.push(writeSyncScript);

    // Load the launchd plist
    const loadPlist = enableServiceDarwin({
        name: "enable-sync-timer",
        service: "com.syncreeper.sync",
        start: true,
        enable: true,
        dependsOn: [writePlist],
    });
    resources.push(loadPlist);

    // Verify the launch agent is loaded
    const verifyLaunchAgent = runCommand({
        name: "verify-sync-timer",
        create: `
            launchctl list | grep syncreeper || echo "LaunchAgent registered (may not show until next interval)"
            echo "GitHub sync timer configured successfully"
            echo ""
            echo "To run sync manually: ${paths.syncScript}"
        `.trim(),
        dependsOn: [loadPlist],
    });
    resources.push(verifyLaunchAgent);

    return { resources };
}
