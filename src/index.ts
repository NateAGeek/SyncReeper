/**
 * SyncReeper - Main Pulumi Orchestrator
 *
 * Configures a VPS to:
 * 1. Secure the system (firewall, SSHGuard, auto-updates)
 * 2. Clone and sync all GitHub repositories
 * 3. Sync repos across devices using Syncthing
 *
 * Deployment Phases:
 * 1. System Setup - Create user and directories
 * 2. Package Installation - Install ALL packages in one apt operation
 * 3. Security Hardening - Configure firewall, SSHGuard, auto-updates
 * 4. Application Services - Configure GitHub sync and Syncthing
 *
 * Run with: pulumi up
 */

import * as pulumi from "@pulumi/pulumi";
import { getConfig } from "./config/index.js";

// Resources
import { createServiceUser } from "./resources/user.js";
import { createDirectories } from "./resources/directories.js";

// Services
import { setupPackages } from "./services/packages/index.js";
import { setupFirewall } from "./services/firewall/index.js";
import { setupSSHGuard } from "./services/sshguard/index.js";
import { setupAutoUpdates } from "./services/auto-updates/index.js";
import { setupGitHubSync } from "./services/github-sync/index.js";
import { setupSyncthing } from "./services/syncthing/index.js";

// Load configuration from Pulumi config
const config = getConfig();

// ============================================================================
// Phase 1: System Setup
// ============================================================================

// Create the service user (syncreeper)
const serviceUser = createServiceUser();

// Create required directories
const directories = createDirectories({
    reposPath: config.sync.reposPath,
    dependsOn: [serviceUser.resource],
});

// ============================================================================
// Phase 2: Package Installation
// ============================================================================

// Install ALL packages in a single apt operation
// This eliminates apt lock contention between services
const packages = setupPackages({
    dependsOn: [serviceUser.resource],
});

// ============================================================================
// Phase 3: Security Hardening
// ============================================================================

// All security services depend on packages being installed
// They can now run in parallel since no apt operations are needed

// Configure UFW firewall (SSH only)
const _firewall = setupFirewall({
    dependsOn: packages.resources,
});

// Setup SSHGuard for brute-force protection
const _sshguard = setupSSHGuard({
    dependsOn: packages.resources,
});

// Configure automatic security updates
const _autoUpdates = setupAutoUpdates({
    autoReboot: true,
    dependsOn: packages.resources,
});

// ============================================================================
// Phase 4: Application Services
// ============================================================================

// Setup GitHub repository sync
const _githubSync = setupGitHubSync({
    config,
    dependsOn: [directories.resource, ...packages.resources],
});

// Setup Syncthing for cross-device sync
const _syncthing = setupSyncthing({
    config,
    dependsOn: [directories.resource, ...packages.resources],
});

// ============================================================================
// Exports
// ============================================================================

// Export useful information
export const outputs = {
    serviceUser: serviceUser.username,
    reposPath: directories.reposPath,

    // Instructions
    accessSyncthingGui: pulumi.interpolate`SSH tunnel: ssh -L 8384:localhost:8384 your-vps && open http://localhost:8384`,
    getDeviceId: "Run: syncreeper-device-id",
    manualSync: "Run: sync-repos",
    viewLogs: "Run: journalctl -u syncreeper-sync -f",

    // Status commands
    checkFirewall: "Run: sudo ufw status",
    checkSyncthing: pulumi.interpolate`Run: systemctl status syncthing@${serviceUser.username}`,
    checkSyncTimer: "Run: systemctl list-timers syncreeper-sync.timer",
};
