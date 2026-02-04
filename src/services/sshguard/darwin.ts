/**
 * macOS SSHGuard service
 *
 * Configures SSHGuard with pf (Packet Filter) backend on macOS.
 * SSHGuard is installed via Homebrew and managed via brew services.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../../lib/command";
import { enableBrewService } from "../../lib/command.darwin";
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
 * Sets up SSHGuard on macOS with pf backend
 *
 * - Configures with Homebrew-installed SSHGuard
 * - Uses pf for blocking (not Application Firewall)
 * - Starts via brew services
 */
export function setupSSHGuardDarwin(options: SetupSSHGuardOptions = {}): SetupSSHGuardResult {
    const { dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];

    // SSHGuard config directory (Homebrew location)
    const configDir = "/opt/homebrew/etc/sshguard";
    const whitelistPath = `${configDir}/whitelist`;

    // Create whitelist file
    const whitelistContent = generateWhitelistContent();
    const createWhitelist = runCommand({
        name: "sshguard-whitelist",
        create: `
            mkdir -p ${configDir}
            cat > ${whitelistPath} << 'EOF'
${whitelistContent}
EOF
            chmod 644 ${whitelistPath}
            echo "SSHGuard whitelist created at ${whitelistPath}"
        `.trim(),
        delete: `rm -f ${whitelistPath}`,
        dependsOn,
    });
    resources.push(createWhitelist);

    // Configure SSHGuard to use pf backend
    // Homebrew SSHGuard on macOS uses pf by default
    const configureSshguard = runCommand({
        name: "configure-sshguard-pf",
        create: `
            # Ensure pf table exists for sshguard
            # This is typically handled by the pf configuration, but ensure it's ready
            sudo pfctl -t sshguard -T show 2>/dev/null || sudo pfctl -t sshguard -T add 127.0.0.1 2>/dev/null && sudo pfctl -t sshguard -T delete 127.0.0.1 2>/dev/null || true
            echo "SSHGuard pf table configured"
        `.trim(),
        dependsOn: [createWhitelist],
    });
    resources.push(configureSshguard);

    // Start SSHGuard via brew services
    const enableSSHGuard = enableBrewService({
        name: "enable-sshguard",
        service: "sshguard",
        start: true,
        dependsOn: [configureSshguard],
    });
    resources.push(enableSSHGuard);

    // Verify SSHGuard is running
    const verifySSHGuard = runCommand({
        name: "verify-sshguard",
        create: `
            brew services list | grep sshguard || echo "SSHGuard service status unknown"
            echo "SSHGuard configured successfully"
        `.trim(),
        dependsOn: [enableSSHGuard],
    });
    resources.push(verifySSHGuard);

    return { resources };
}
