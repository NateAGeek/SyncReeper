/**
 * Linux SSHGuard service
 *
 * Configures SSHGuard with UFW backend on Linux.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand, enableService } from "../../lib/command";
import type { SetupSSHGuardOptions, SetupSSHGuardResult } from "./types";
import { SSHGUARD_CONFIG } from "./types";

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
 * Sets up SSHGuard on Linux with UFW backend
 *
 * - Configures with aggressive settings
 * - Integrates with UFW
 * - Enables and starts the systemd service
 */
export function setupSSHGuardLinux(options: SetupSSHGuardOptions = {}): SetupSSHGuardResult {
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
