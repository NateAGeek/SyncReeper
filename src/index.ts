/**
 * SyncReeper - Main Pulumi Orchestrator
 *
 * Configures a VPS to:
 * 1. Secure the system (firewall, SSHGuard, auto-updates)
 * 2. Clone and sync all GitHub repositories
 * 3. Sync repos across devices using Syncthing
 *
 * Run with: pulumi up
 */

import * as pulumi from "@pulumi/pulumi";
import { getConfig } from "./config/index.js";

// Resources
import { createServiceUser } from "./resources/user.js";
import { createDirectories } from "./resources/directories.js";

// Services
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
// Phase 2: Security Hardening
// ============================================================================

// IMPORTANT: All apt operations must be serialized to avoid lock contention.
// The dependency chain is: firewall -> sshguard -> autoUpdates -> githubSync -> syncthing

// Configure UFW firewall (SSH only)
const firewall = setupFirewall({
    dependsOn: [serviceUser.resource],
});

// Setup SSHGuard for brute-force protection
const sshguard = setupSSHGuard({
    dependsOn: firewall.resources,
});

// Configure automatic security updates
const autoUpdates = setupAutoUpdates({
    autoReboot: true,
    dependsOn: sshguard.resources,
});

// ============================================================================
// Phase 3: Application Services
// ============================================================================

// Setup GitHub repository sync (depends on autoUpdates for apt serialization)
const githubSync = setupGitHubSync({
    config,
    dependsOn: [directories.resource, ...autoUpdates.resources],
});

// Setup Syncthing for cross-device sync (depends on githubSync for apt serialization)
const _syncthing = setupSyncthing({
    config,
    dependsOn: [directories.resource, ...githubSync.resources],
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
