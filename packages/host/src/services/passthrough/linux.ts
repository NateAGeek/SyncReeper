/**
 * Linux passthrough tunnel service
 *
 * Creates a dedicated 'passthrough' user on the VPS and configures SSHD
 * to accept reverse SSH tunnels from the home machine.
 *
 * Security model:
 * - passthrough user has /usr/sbin/nologin as shell (no interactive access)
 * - ForceCommand prevents any command execution (tunnel only)
 * - AllowTcpForwarding restricted to 'remote' only (only -R, not -L)
 * - PermitOpen restricts which ports can be forwarded
 * - PermitTTY disabled (no interactive terminal)
 * - GatewayPorts disabled (tunnel only accessible from VPS localhost)
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand, writeFile } from "../../lib/command";
import type { SetupPassthroughOptions, SetupPassthroughResult } from "./types";
import { PASSTHROUGH_DEFAULTS } from "./types";

/**
 * Generates the SSHD Match block configuration for the passthrough user.
 *
 * This drop-in config uses a Match block to override the global SSH
 * hardening settings (which disable TCP forwarding) specifically for
 * the passthrough user, while maintaining all other restrictions.
 */
export function generatePassthroughSSHDConfig(tunnelPort: number): string {
    const lines = [
        "# SyncReeper Passthrough Tunnel Configuration",
        "# Managed by Pulumi - Do not edit manually",
        "#",
        "# This Match block overrides global SSH hardening for the passthrough",
        "# user only, allowing reverse SSH tunnels from the home machine.",
        "#",
        "# The passthrough user:",
        "#   - Cannot execute any commands (ForceCommand /usr/sbin/nologin)",
        "#   - Cannot open an interactive terminal (PermitTTY no)",
        "#   - Can only set up remote/reverse port forwards (-R)",
        `#   - Can only forward to localhost:${tunnelPort}`,
        "#   - Cannot bind to external interfaces (GatewayPorts no)",
        "",
        "Match User passthrough",
        "    ForceCommand /usr/sbin/nologin",
        "    AllowTcpForwarding remote",
        `    PermitOpen localhost:${tunnelPort}`,
        "    GatewayPorts no",
        "    PermitTTY no",
        "    X11Forwarding no",
        "    AllowAgentForwarding no",
        "",
    ];
    return lines.join("\n");
}

/**
 * Generates the authorized_keys file content for the passthrough user
 */
export function generatePassthroughAuthorizedKeys(keys: string[]): string {
    const lines = [
        "# SyncReeper Passthrough Tunnel Authorized Keys",
        "# Managed by Pulumi - Do not edit manually",
        "# These keys are used by the home machine to establish reverse SSH tunnels",
        "",
        ...keys,
        "",
    ];
    return lines.join("\n");
}

/**
 * Sets up the passthrough tunnel service on Linux
 *
 * Creates:
 * 1. A dedicated 'passthrough' system user with no login shell
 * 2. SSH directory and authorized_keys for the passthrough user
 * 3. SSHD Match block drop-in config for tunnel-only access
 * 4. Validates and restarts SSHD
 *
 * Prerequisites:
 * - SSH packages must be installed
 * - SSH hardening should be configured (AllowUsers must include 'passthrough')
 */
export function setupPassthroughLinux(options: SetupPassthroughOptions): SetupPassthroughResult {
    const {
        authorizedKeys,
        tunnelPort = PASSTHROUGH_DEFAULTS.tunnelPort,
        dependsOn = [],
    } = options;
    const resources: pulumi.Resource[] = [];

    // Validate we have at least one authorized key
    if (!authorizedKeys || authorizedKeys.length === 0) {
        throw new Error(
            "Passthrough tunnel requires at least one authorized key from the home machine. " +
                "Run the passthrough setup on your Mac Mini first to generate a keypair, " +
                "then add the public key to syncreeper:passthrough-authorized-keys in Pulumi config."
        );
    }

    // --- Step 1: Create the passthrough user ---
    const createUser = runCommand({
        name: "passthrough-create-user",
        create: `
            if ! id "${PASSTHROUGH_DEFAULTS.username}" &>/dev/null; then
                useradd --system --create-home --home-dir "${PASSTHROUGH_DEFAULTS.homeDir}" --shell "${PASSTHROUGH_DEFAULTS.shell}" "${PASSTHROUGH_DEFAULTS.username}"
                echo "User ${PASSTHROUGH_DEFAULTS.username} created"
            else
                echo "User ${PASSTHROUGH_DEFAULTS.username} already exists"
            fi
        `.trim(),
        delete: `
            userdel -r "${PASSTHROUGH_DEFAULTS.username}" || true
            echo "User ${PASSTHROUGH_DEFAULTS.username} removed"
        `.trim(),
        dependsOn,
    });
    resources.push(createUser);

    // --- Step 2: Create .ssh directory for passthrough user ---
    const createSSHDir = runCommand({
        name: "passthrough-ssh-dir",
        create: `
            mkdir -p ${PASSTHROUGH_DEFAULTS.homeDir}/.ssh
            chmod 700 ${PASSTHROUGH_DEFAULTS.homeDir}/.ssh
            chown ${PASSTHROUGH_DEFAULTS.username}:${PASSTHROUGH_DEFAULTS.username} ${PASSTHROUGH_DEFAULTS.homeDir}/.ssh
        `.trim(),
        delete: `
            rm -rf ${PASSTHROUGH_DEFAULTS.homeDir}/.ssh
        `.trim(),
        dependsOn: [createUser],
    });
    resources.push(createSSHDir);

    // --- Step 3: Deploy authorized_keys for passthrough user ---
    const authorizedKeysContent = generatePassthroughAuthorizedKeys(authorizedKeys);
    const authorizedKeysFile = writeFile({
        name: "passthrough-authorized-keys",
        path: `${PASSTHROUGH_DEFAULTS.homeDir}/.ssh/authorized_keys`,
        content: authorizedKeysContent,
        mode: "600",
        owner: PASSTHROUGH_DEFAULTS.username,
        group: PASSTHROUGH_DEFAULTS.username,
        dependsOn: [createSSHDir],
    });
    resources.push(authorizedKeysFile);

    // --- Step 4: Write SSHD Match block drop-in config ---
    const sshdConfigContent = generatePassthroughSSHDConfig(tunnelPort);
    const sshdConfig = writeFile({
        name: "passthrough-sshd-config",
        path: PASSTHROUGH_DEFAULTS.sshdConfigPath,
        content: sshdConfigContent,
        mode: "600",
        owner: "root",
        group: "root",
        dependsOn: [createUser],
    });
    resources.push(sshdConfig);

    // --- Step 5: Validate SSHD config ---
    const validateConfig = runCommand({
        name: "passthrough-validate-sshd",
        create: `
            sshd -t
            echo "SSH configuration validated successfully with passthrough tunnel config"
        `.trim(),
        dependsOn: [sshdConfig, authorizedKeysFile],
    });
    resources.push(validateConfig);

    // --- Step 6: Restart SSHD to apply changes ---
    const restartSSHD = runCommand({
        name: "passthrough-restart-sshd",
        create: `
            systemctl restart sshd
            echo "SSH daemon restarted with passthrough tunnel configuration"
        `.trim(),
        dependsOn: [validateConfig],
    });
    resources.push(restartSSHD);

    // --- Step 7: Verify SSHD is running ---
    const verifySSHD = runCommand({
        name: "passthrough-verify",
        create: `
            systemctl is-active sshd
            echo "Passthrough tunnel service configured successfully"
            echo "  - Tunnel user: ${PASSTHROUGH_DEFAULTS.username}"
            echo "  - Tunnel port: ${tunnelPort}"
            echo "  - Authorized keys: ${authorizedKeys.length} key(s) deployed"
            echo ""
            echo "To connect to your home machine from this VPS:"
            echo "  ssh <your-mac-user>@localhost -p ${tunnelPort}"
        `.trim(),
        dependsOn: [restartSSHD],
    });
    resources.push(verifySSHD);

    return { resources };
}
