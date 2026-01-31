/**
 * GitHub Sync Service
 *
 * Deploys the sync application and sets up a systemd timer
 * for periodic repository synchronization.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as pulumi from "@pulumi/pulumi";
import { runCommand, writeFile, copyFile, enableService } from "../../lib/command.js";
import { PATHS, SERVICE_USER } from "../../config/types.js";
import type { SyncReeperConfig } from "../../config/types.js";

/**
 * Gets the sync app bundle path
 * Throws an error if the bundle doesn't exist, prompting user to build first
 */
function getSyncAppBundlePath(): string {
    const bundlePath = path.join(process.cwd(), "sync", "dist", "bundle.js");

    if (!fs.existsSync(bundlePath)) {
        throw new Error(
            `Sync app bundle not found at ${bundlePath}. ` +
                `Please run 'npm run build:all' before deploying.`
        );
    }

    return bundlePath;
}

export interface SetupGitHubSyncOptions {
    /** SyncReeper configuration */
    config: SyncReeperConfig;
    /** Resources to depend on */
    dependsOn?: pulumi.Resource[];
}

export interface SetupGitHubSyncResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
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
 * Generates the systemd service unit file
 */
function generateServiceUnit(reposPath: string): string {
    const { name: username } = SERVICE_USER;

    return `[Unit]
Description=SyncReeper GitHub Repository Sync
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=${username}
Group=${username}

# Load environment with secrets
EnvironmentFile=/etc/syncreeper/sync.env

# Working directory
WorkingDirectory=${PATHS.syncApp}

# Run the sync application (using NVM-installed Node.js)
ExecStart=/usr/local/bin/node ${PATHS.syncApp}/dist/bundle.js

# Logging to journal
StandardOutput=journal
StandardError=journal
SyslogIdentifier=syncreeper-sync

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${reposPath}
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
`;
}

/**
 * Generates the systemd timer unit file
 */
function generateTimerUnit(schedule: string): string {
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
 */
function generateSyncScript(): string {
    return `#!/bin/bash
# Manual trigger for SyncReeper sync
# Runs the sync service immediately

set -e

echo "Starting manual sync..."
sudo systemctl start syncreeper-sync.service

echo "Sync started. View logs with:"
echo "  journalctl -u syncreeper-sync -f"
`;
}

/**
 * Sets up the GitHub sync service
 * - Deploys the sync application
 * - Creates systemd service and timer
 *
 * Note: Node.js is installed via NVM in the packages service
 */
export function setupGitHubSync(options: SetupGitHubSyncOptions): SetupGitHubSyncResult {
    const { config, dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];
    const { name: username } = SERVICE_USER;

    // Create environment directory
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

    // Write environment file with secrets
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

    // Get the bundled sync application path
    const bundlePath = getSyncAppBundlePath();

    // Create sync app directory
    const createSyncAppDir = runCommand({
        name: "create-sync-app-dir",
        create: `
            mkdir -p ${PATHS.syncApp}/dist
            chown -R ${username}:${username} ${PATHS.syncApp}
            echo "Sync app directory created at ${PATHS.syncApp}"
        `.trim(),
        delete: `rm -rf ${PATHS.syncApp}`,
        dependsOn,
    });
    resources.push(createSyncAppDir);

    // Deploy the bundled sync application using cp (avoids argument length limits)
    const deploySyncBundle = copyFile({
        name: "deploy-sync-bundle",
        src: bundlePath,
        dest: `${PATHS.syncApp}/dist/bundle.js`,
        mode: "644",
        owner: username,
        group: username,
        dependsOn: [createSyncAppDir],
    });
    resources.push(deploySyncBundle);

    // Verify the bundle is valid JavaScript
    const verifySyncBundle = runCommand({
        name: "verify-sync-bundle",
        create: `/usr/local/bin/node --check ${PATHS.syncApp}/dist/bundle.js && echo "Sync app bundle verified successfully"`,
        dependsOn: [deploySyncBundle],
    });
    resources.push(verifySyncBundle);

    // Write systemd service unit
    const serviceUnit = generateServiceUnit(config.sync.reposPath);
    const writeServiceUnit = writeFile({
        name: "syncreeper-sync-service",
        path: "/etc/systemd/system/syncreeper-sync.service",
        content: serviceUnit,
        mode: "644",
        owner: "root",
        group: "root",
        dependsOn: [verifySyncBundle, writeEnvFile],
    });
    resources.push(writeServiceUnit);

    // Write systemd timer unit
    const timerUnit = generateTimerUnit(config.sync.schedule);
    const writeTimerUnit = writeFile({
        name: "syncreeper-sync-timer",
        path: "/etc/systemd/system/syncreeper-sync.timer",
        content: timerUnit,
        mode: "644",
        owner: "root",
        group: "root",
        dependsOn: [writeServiceUnit],
    });
    resources.push(writeTimerUnit);

    // Write convenience script
    const syncScript = generateSyncScript();
    const writeSyncScript = writeFile({
        name: "sync-repos-script",
        path: PATHS.syncScript,
        content: syncScript,
        mode: "755",
        owner: "root",
        group: "root",
        dependsOn: [writeServiceUnit],
    });
    resources.push(writeSyncScript);

    // Enable and start the timer (not the service directly)
    const enableTimer = enableService({
        name: "enable-sync-timer",
        service: "syncreeper-sync.timer",
        start: true,
        enable: true,
        dependsOn: [writeTimerUnit],
    });
    resources.push(enableTimer);

    // Verify timer is active
    const verifyTimer = runCommand({
        name: "verify-sync-timer",
        create: `
            systemctl list-timers syncreeper-sync.timer --no-pager
            echo "GitHub sync timer configured successfully"
        `.trim(),
        dependsOn: [enableTimer],
    });
    resources.push(verifyTimer);

    return { resources };
}
