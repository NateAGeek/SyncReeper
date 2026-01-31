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

import { getConfig } from "./config/index.js";

// Resources
import { createServiceUser } from "./resources/user.js";
import { createDirectories } from "./resources/directories.js";

// Services
import { setupPackages } from "./services/packages/index.js";
import { setupFirewall } from "./services/firewall/index.js";
import { setupSSH } from "./services/ssh/index.js";
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

// Harden SSH configuration (disable password auth, root login, restrict to syncreeper user)
const _ssh = setupSSH({
    authorizedKeys: config.ssh.authorizedKeys,
    dependsOn: [serviceUser.resource, ...packages.resources],
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

    // Post-deployment instructions
    postDeploymentInstructions: `
================================================================================
DEPLOYMENT COMPLETE - Next Steps:
================================================================================

IMPORTANT: SSH ACCESS HAS BEEN HARDENED
- Password authentication is DISABLED
- Root login is DISABLED  
- Only the 'syncreeper' user can SSH in
- Connect with: ssh syncreeper@your-vps

1. TRIGGER INITIAL SYNC (required):
   The GitHub sync timer runs daily. To sync repositories immediately:
   
   sudo systemctl start syncreeper-sync.service
   
   Monitor progress with:
   journalctl -u syncreeper-sync -f

2. GET SYNCTHING DEVICE ID:
   Run this on your VPS to get the device ID for pairing:
   
   syncreeper-device-id

3. ACCESS SYNCTHING GUI:
   Create an SSH tunnel and open the web interface:
   
   ssh -L 8384:localhost:8384 syncreeper@your-vps
   Then open: http://localhost:8384

4. ADD VPS TO OTHER DEVICES:
   - Open Syncthing on your other devices
   - Add the VPS device using its device ID
   - Share the "repos" folder with it

================================================================================
`,

    // Quick reference commands
    commands: {
        triggerSync: "sudo systemctl start syncreeper-sync.service",
        viewSyncLogs: "journalctl -u syncreeper-sync -f",
        getDeviceId: "syncreeper-device-id",
        checkFirewall: "sudo ufw status",
        checkSSH: "sudo sshd -T | grep -E 'passwordauthentication|permitrootlogin|allowusers'",
        checkSyncthing: `systemctl status syncthing@${serviceUser.username}`,
        checkSyncTimer: "systemctl list-timers syncreeper-sync.timer",
    },
};
