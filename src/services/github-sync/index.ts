/**
 * GitHub Sync Service
 *
 * Deploys the sync application and sets up a systemd timer
 * for periodic repository synchronization.
 */

import * as pulumi from "@pulumi/pulumi";
import { runCommand, writeFile, enableService } from "../../lib/command.js";
import { PATHS, SERVICE_USER } from "../../config/types.js";
import type { SyncReeperConfig } from "../../config/types.js";

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
function generateServiceUnit(): string {
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

# Run the sync application
ExecStart=/usr/bin/node ${PATHS.syncApp}/dist/index.js

# Logging to journal
StandardOutput=journal
StandardError=journal
SyslogIdentifier=syncreeper-sync

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${PATHS.syncApp}/../..
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
 * - Installs Node.js
 * - Deploys the sync application
 * - Creates systemd service and timer
 */
export function setupGitHubSync(options: SetupGitHubSyncOptions): SetupGitHubSyncResult {
    const { config, dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];
    const { name: username } = SERVICE_USER;

    // Install Node.js
    const installNode = runCommand({
        name: "install-nodejs",
        create: `
            # Install Node.js 20.x from NodeSource
            if ! command -v node &> /dev/null; then
                curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
                apt-get install -y nodejs
            fi
            node --version
            npm --version
        `.trim(),
        dependsOn,
    });
    resources.push(installNode);

    // Create environment directory
    const createEnvDir = runCommand({
        name: "create-sync-env-dir",
        create: `
            mkdir -p /etc/syncreeper
            chmod 750 /etc/syncreeper
            chown root:${username} /etc/syncreeper
        `.trim(),
        delete: "rm -rf /etc/syncreeper",
        dependsOn: [installNode],
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

    // Deploy sync application
    // Note: In a real deployment, you'd copy the built app here
    // For now, we assume it's deployed via a separate mechanism or built in place
    const deploySyncApp = runCommand({
        name: "deploy-sync-app",
        create: `
            # Ensure directory exists
            mkdir -p ${PATHS.syncApp}
            chown ${username}:${username} ${PATHS.syncApp}
            
            # Note: The actual application files should be deployed here
            # This could be done via:
            # 1. Git clone from a releases repo
            # 2. Copy from local build
            # 3. Download from releases
            echo "Sync app directory prepared at ${PATHS.syncApp}"
        `.trim(),
        dependsOn: [installNode],
    });
    resources.push(deploySyncApp);

    // Write systemd service unit
    const serviceUnit = generateServiceUnit();
    const writeServiceUnit = writeFile({
        name: "syncreeper-sync-service",
        path: "/etc/systemd/system/syncreeper-sync.service",
        content: serviceUnit,
        mode: "644",
        owner: "root",
        group: "root",
        dependsOn: [deploySyncApp, writeEnvFile],
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
