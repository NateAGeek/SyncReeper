/**
 * Linux GitHub Sync Service
 *
 * Deploys the sync application and sets up a user-level systemd timer
 * for periodic repository synchronization.
 *
 * Uses user-level systemd services (systemctl --user) which allows
 * the service user to manage the service without root privileges.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as pulumi from "@pulumi/pulumi";
import { runCommand, writeFile, copyFile } from "../../lib/command";
import { enableUserServiceLinux } from "../../lib/command.linux";
import { getServiceUser, getPaths } from "../../config/types";
import type { SetupGitHubSyncOptions, SetupGitHubSyncResult } from "./types";
import type { SyncReeperConfig } from "../../config/types";

/**
 * Gets the sync app bundle path
 * Throws an error if the bundle doesn't exist, prompting user to build first
 */
function getSyncAppBundlePath(): string {
    const bundlePath = path.join(process.cwd(), "packages", "sync", "dist", "bundle.js");

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
 * Contains secrets, stored in /etc with restricted permissions
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
 * Generates the user-level systemd service unit file
 * Note: No User/Group for user services - they run as the owning user
 */
export function generateServiceUnit(reposPath: string): string {
    const { syncApp, envDir } = getPaths();

    return `[Unit]
Description=SyncReeper GitHub Repository Sync
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot

# Load environment with secrets (system-level for security)
EnvironmentFile=${envDir}/sync.env

# Working directory
WorkingDirectory=${syncApp}

# Run the sync application
ExecStart=/usr/local/bin/node ${syncApp}/dist/bundle.js

# Logging to journal
StandardOutput=journal
StandardError=journal
SyslogIdentifier=syncreeper-sync

# Security hardening (adjusted for user service)
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=default.target
`;
}

/**
 * Generates the user-level systemd timer unit file
 */
export function generateTimerUnit(schedule: string): string {
    // Convert friendly names to OnCalendar format
    const calendarSchedule =
        schedule === "daily"
            ? "*-*-* 03:00:00"
            : schedule === "hourly"
              ? "*-*-* *:00:00"
              : schedule;

    return `[Unit]
Description=SyncReeper GitHub Sync Timer
Requires=syncreeper-sync.service

[Timer]
# Run on schedule
OnCalendar=${calendarSchedule}

# Randomize start time by up to 15 minutes to avoid thundering herd
RandomizedDelaySec=900

# Run immediately if we missed a scheduled run (e.g., system was off)
Persistent=true

[Install]
WantedBy=timers.target
`;
}

/**
 * Generates a convenience script for manual sync
 * Must be run as the configured service user
 */
export function generateSyncScript(username: string): string {
    return `#!/bin/bash
# Manual trigger for SyncReeper sync
# Must be run as the '${username}' user

set -e

CURRENT_USER=$(whoami)

if [ "$CURRENT_USER" != "${username}" ]; then
    echo "Error: This script must be run as the '${username}' user."
    echo ""
    echo "Options:"
    echo "  1. Run as ${username}:"
    echo "     sudo -u ${username} sync-repos"
    echo ""
    echo "  2. Via SSH (from your workstation):"
    echo "     ssh ${username}@your-vps sync-repos"
    exit 1
fi

echo "Starting manual sync..."
systemctl --user start syncreeper-sync.service

echo "Sync started. View logs with:"
echo "  journalctl --user -u syncreeper-sync -f"
`;
}

/**
 * Sets up the GitHub sync service on Linux
 * - Migrates from system-level to user-level service if needed
 * - Deploys the sync application to user home
 * - Creates user-level systemd service and timer
 */
export function setupGitHubSyncLinux(options: SetupGitHubSyncOptions): SetupGitHubSyncResult {
    const { config, dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];
    const { name: username, home: userHome } = getServiceUser();
    const { syncApp, syncScript, userSystemd } = getPaths();

    // Step 1: Migrate old system-level service to user-level (if it exists)
    const migrateOldService = runCommand({
        name: "migrate-old-system-service",
        create: `
            if systemctl is-enabled syncreeper-sync.timer 2>/dev/null; then
                echo "Migrating from system-level service to user-level..."
                systemctl stop syncreeper-sync.timer 2>/dev/null || true
                systemctl disable syncreeper-sync.timer 2>/dev/null || true
                systemctl stop syncreeper-sync.service 2>/dev/null || true
                systemctl disable syncreeper-sync.service 2>/dev/null || true
                rm -f /etc/systemd/system/syncreeper-sync.service
                rm -f /etc/systemd/system/syncreeper-sync.timer
                systemctl daemon-reload
                echo "Old system service removed"
            else
                echo "No old system service to migrate"
            fi
        `.trim(),
        dependsOn,
    });
    resources.push(migrateOldService);

    // Step 2: Migrate old sync app location (if it exists)
    const migrateOldSyncApp = runCommand({
        name: "migrate-old-sync-app",
        create: `
            OLD_PATH="/opt/syncreeper/sync"
            NEW_PATH="${syncApp}"
            
            if [ -d "$OLD_PATH" ] && [ ! -d "$NEW_PATH" ]; then
                echo "Moving sync app from $OLD_PATH to $NEW_PATH..."
                mkdir -p "$(dirname "$NEW_PATH")"
                mv "$OLD_PATH" "$NEW_PATH"
                chown -R ${username}:${username} "$NEW_PATH"
                rmdir /opt/syncreeper 2>/dev/null || true
                echo "Sync app migrated"
            else
                echo "Sync app directory setup (no migration needed)"
            fi
        `.trim(),
        dependsOn: [migrateOldService],
    });
    resources.push(migrateOldSyncApp);

    // Step 3: Enable user lingering so services run without login
    const enableLingering = runCommand({
        name: "enable-user-lingering",
        create: `loginctl enable-linger ${username}`,
        delete: `loginctl disable-linger ${username}`,
        dependsOn: [migrateOldService],
    });
    resources.push(enableLingering);

    // Step 4: Create user systemd directory
    const createUserSystemdDir = runCommand({
        name: "create-user-systemd-dir",
        create: `
            mkdir -p ${userSystemd}
            chown -R ${username}:${username} ${userHome}/.config
        `.trim(),
        dependsOn: [enableLingering],
    });
    resources.push(createUserSystemdDir);

    // Step 5: Create environment directory (system-level for security)
    const createEnvDir = runCommand({
        name: "create-sync-env-dir",
        create: `
            mkdir -p /etc/syncreeper
            chmod 750 /etc/syncreeper
            chown root:${username} /etc/syncreeper
        `.trim(),
        delete: "rm -rf /etc/syncreeper",
        dependsOn,
    });
    resources.push(createEnvDir);

    // Step 6: Write environment file with secrets
    const envContent = generateEnvFileContent(config);
    const writeEnvFile = writeFile({
        name: "sync-env-file",
        path: "/etc/syncreeper/sync.env",
        content: envContent,
        mode: "640",
        owner: "root",
        group: username,
        dependsOn: [createEnvDir],
    });
    resources.push(writeEnvFile);

    // Step 7: Get the bundled sync application path
    const bundlePath = getSyncAppBundlePath();

    // Step 8: Create sync app directory (in user home)
    const createSyncAppDir = runCommand({
        name: "create-sync-app-dir",
        create: `
            mkdir -p ${syncApp}/dist
            chown -R ${username}:${username} ${syncApp}
            echo "Sync app directory created at ${syncApp}"
        `.trim(),
        delete: `rm -rf ${syncApp}`,
        dependsOn: [migrateOldSyncApp],
    });
    resources.push(createSyncAppDir);

    // Step 9: Deploy the bundled sync application
    const deploySyncBundle = copyFile({
        name: "deploy-sync-bundle",
        src: bundlePath,
        dest: `${syncApp}/dist/bundle.js`,
        mode: "644",
        owner: username,
        group: username,
        dependsOn: [createSyncAppDir],
    });
    resources.push(deploySyncBundle);

    // Step 10: Verify the bundle is valid JavaScript
    const verifySyncBundle = runCommand({
        name: "verify-sync-bundle",
        create: `/usr/local/bin/node --check ${syncApp}/dist/bundle.js && echo "Sync app bundle verified successfully"`,
        dependsOn: [deploySyncBundle],
    });
    resources.push(verifySyncBundle);

    // Step 11: Write user-level systemd service unit
    const serviceUnit = generateServiceUnit(config.sync.reposPath);
    const writeServiceUnit = writeFile({
        name: "syncreeper-sync-service",
        path: `${userSystemd}/syncreeper-sync.service`,
        content: serviceUnit,
        mode: "644",
        owner: username,
        group: username,
        dependsOn: [createUserSystemdDir, verifySyncBundle, writeEnvFile],
    });
    resources.push(writeServiceUnit);

    // Step 12: Write user-level systemd timer unit
    const timerUnit = generateTimerUnit(config.sync.schedule);
    const writeTimerUnit = writeFile({
        name: "syncreeper-sync-timer",
        path: `${userSystemd}/syncreeper-sync.timer`,
        content: timerUnit,
        mode: "644",
        owner: username,
        group: username,
        dependsOn: [writeServiceUnit],
    });
    resources.push(writeTimerUnit);

    // Step 13: Write convenience script
    const syncScriptContent = generateSyncScript(username);
    const writeSyncScript = writeFile({
        name: "sync-repos-script",
        path: syncScript,
        content: syncScriptContent,
        mode: "755",
        owner: "root",
        group: "root",
        dependsOn: [writeServiceUnit],
    });
    resources.push(writeSyncScript);

    // Step 14: Enable and start the user-level timer
    const enableTimer = enableUserServiceLinux({
        name: "enable-sync-timer",
        service: "syncreeper-sync.timer",
        username: username,
        start: true,
        enable: true,
        dependsOn: [writeTimerUnit],
    });
    resources.push(enableTimer);

    // Step 15: Verify timer is active
    const uidCmd = `$(id -u ${username})`;
    const envPrefix = `sudo -u ${username} XDG_RUNTIME_DIR=/run/user/${uidCmd}`;
    const verifyTimer = runCommand({
        name: "verify-sync-timer",
        create: `
            ${envPrefix} systemctl --user list-timers syncreeper-sync.timer --no-pager
            echo "GitHub sync timer configured successfully (user-level service)"
        `.trim(),
        dependsOn: [enableTimer],
    });
    resources.push(verifyTimer);

    return { resources };
}
