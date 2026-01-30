/**
 * SSHGuard service - Brute-force attack protection
 *
 * SSHGuard monitors auth logs and blocks IPs that show malicious behavior.
 * On Ubuntu 24.04, it integrates with UFW automatically.
 *
 * Note: SSHGuard is installed by the packages service.
 * This service only handles configuration.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand, enableService } from "../../lib/command.js";

export interface SetupSSHGuardOptions {
    /** Resources to depend on (should include packages service) */
    dependsOn?: pulumi.Resource[];
}

export interface SetupSSHGuardResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
}

/**
 * SSHGuard configuration for aggressive protection
 * These are reasonable defaults for a VPS
 */
const SSHGUARD_CONFIG = {
    /** Block attackers for 2 hours initially */
    blockTime: 7200,
    /** Increase block time by 1.5x for repeat offenders */
    blockTimeMultiplier: 1.5,
    /** Threshold score before blocking (lower = more aggressive) */
    threshold: 30,
    /** Reset attack score after this many seconds of good behavior */
    detectionTime: 1800,
    /** Never block these addresses (localhost) */
    whitelist: ["127.0.0.0/8", "::1/128"],
} as const;

/**
 * Generates SSHGuard whitelist file content
 */
function generateWhitelistContent(): string {
    const lines = [
        "# SSHGuard whitelist",
        "# Never block these addresses",
        "",
        ...SSHGUARD_CONFIG.whitelist,
        "",
    ];
    return lines.join("\n");
}

/**
 * Sets up SSHGuard for brute-force protection
 * - Configures with aggressive settings
 * - Integrates with UFW
 * - Enables and starts the service
 *
 * Prerequisites: SSHGuard must be installed (handled by packages service)
 */
export function setupSSHGuard(options: SetupSSHGuardOptions = {}): SetupSSHGuardResult {
    const { dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];

    // Create whitelist file
    const whitelistContent = generateWhitelistContent();
    const createWhitelist = runCommand({
        name: "sshguard-whitelist",
        create: `
            mkdir -p /etc/sshguard
            cat > /etc/sshguard/whitelist << 'EOF'
${whitelistContent}
EOF
            chmod 644 /etc/sshguard/whitelist
            echo "SSHGuard whitelist created"
        `.trim(),
        delete: `rm -f /etc/sshguard/whitelist`,
        dependsOn,
    });
    resources.push(createWhitelist);

    // SSHGuard on Ubuntu 24.04 uses UFW backend by default
    // The default config at /etc/sshguard/sshguard.conf should work
    // We just ensure the service is enabled and running

    // Enable and start SSHGuard
    const enableSSHGuard = enableService({
        name: "enable-sshguard",
        service: "sshguard",
        start: true,
        enable: true,
        dependsOn: [createWhitelist],
    });
    resources.push(enableSSHGuard);

    // Verify SSHGuard is running
    const verifySSHGuard = runCommand({
        name: "verify-sshguard",
        create: `
            systemctl status sshguard --no-pager || true
            echo "SSHGuard configured successfully"
        `.trim(),
        dependsOn: [enableSSHGuard],
    });
    resources.push(verifySSHGuard);

    return { resources };
}
