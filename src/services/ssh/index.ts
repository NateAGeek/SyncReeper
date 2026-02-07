/**
 * SSH Hardening Service
 *
 * Configures SSH daemon with security best practices:
 * - Disables password authentication (key-only)
 * - Disables root login
 * - Restricts access to syncreeper user only
 * - Deploys authorized SSH keys
 *
 * Uses sshd_config.d drop-in files for clean configuration management.
 * Works alongside SSHGuard for brute-force protection.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand, writeFile } from "../../lib/command";
import { getServiceUser } from "../../config/types";

export interface SetupSSHOptions {
    /** List of authorized SSH public keys for the syncreeper user */
    authorizedKeys: string[];
    /** Resources to depend on (should include packages and user creation) */
    dependsOn?: pulumi.Resource[];
}

export interface SetupSSHResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
}

/**
 * SSH hardening configuration
 * These settings prioritize security for a VPS environment
 */
const SSHD_HARDENING_CONFIG = {
    // Authentication
    permitRootLogin: "no",
    passwordAuthentication: "no",
    pubkeyAuthentication: "yes",
    authenticationMethods: "publickey",
    maxAuthTries: 3,

    // User restrictions
    allowUsers: getServiceUser().name,

    // Session security
    clientAliveInterval: 300,
    clientAliveCountMax: 2,
    loginGraceTime: 60,

    // Disable unnecessary features
    x11Forwarding: "no",
    allowAgentForwarding: "no",
    allowTcpForwarding: "no",
    permitTunnel: "no",

    // Logging
    logLevel: "VERBOSE",
} as const;

/**
 * Generates the sshd_config.d drop-in file content
 */
function generateSSHDConfig(): string {
    const lines = [
        "# SyncReeper SSH Hardening Configuration",
        "# Managed by Pulumi - Do not edit manually",
        "# This file overrides settings in /etc/ssh/sshd_config",
        "",
        "# === Authentication ===",
        `PermitRootLogin ${SSHD_HARDENING_CONFIG.permitRootLogin}`,
        `PasswordAuthentication ${SSHD_HARDENING_CONFIG.passwordAuthentication}`,
        `PubkeyAuthentication ${SSHD_HARDENING_CONFIG.pubkeyAuthentication}`,
        `AuthenticationMethods ${SSHD_HARDENING_CONFIG.authenticationMethods}`,
        `MaxAuthTries ${SSHD_HARDENING_CONFIG.maxAuthTries}`,
        "",
        "# Disable other auth methods",
        "KbdInteractiveAuthentication no",
        "ChallengeResponseAuthentication no",
        "UsePAM yes",
        "",
        "# === User Restrictions ===",
        `AllowUsers ${SSHD_HARDENING_CONFIG.allowUsers}`,
        "",
        "# === Session Security ===",
        `ClientAliveInterval ${SSHD_HARDENING_CONFIG.clientAliveInterval}`,
        `ClientAliveCountMax ${SSHD_HARDENING_CONFIG.clientAliveCountMax}`,
        `LoginGraceTime ${SSHD_HARDENING_CONFIG.loginGraceTime}`,
        "",
        "# === Disable Unnecessary Features ===",
        `X11Forwarding ${SSHD_HARDENING_CONFIG.x11Forwarding}`,
        `AllowAgentForwarding ${SSHD_HARDENING_CONFIG.allowAgentForwarding}`,
        `AllowTcpForwarding ${SSHD_HARDENING_CONFIG.allowTcpForwarding}`,
        `PermitTunnel ${SSHD_HARDENING_CONFIG.permitTunnel}`,
        "",
        "# === Logging ===",
        `LogLevel ${SSHD_HARDENING_CONFIG.logLevel}`,
        "",
    ];
    return lines.join("\n");
}

/**
 * Generates the authorized_keys file content
 */
function generateAuthorizedKeys(keys: string[]): string {
    const lines = [
        "# SyncReeper Authorized SSH Keys",
        "# Managed by Pulumi - Do not edit manually",
        "",
        ...keys,
        "",
    ];
    return lines.join("\n");
}

/**
 * Sets up SSH hardening for the VPS
 * - Deploys hardened sshd_config.d drop-in
 * - Deploys authorized_keys for syncreeper user
 * - Restarts sshd to apply changes
 *
 * Prerequisites:
 * - syncreeper user must exist
 * - SSH keys must be configured in Pulumi config
 */
export function setupSSH(options: SetupSSHOptions): SetupSSHResult {
    const { authorizedKeys, dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];

    // Validate we have at least one SSH key
    if (!authorizedKeys || authorizedKeys.length === 0) {
        throw new Error(
            "SSH hardening requires at least one authorized key. " +
                "Add keys to syncreeper:ssh-authorized-keys in Pulumi config."
        );
    }

    // Create sshd_config.d drop-in file for hardening
    // Using 99- prefix to ensure it's applied last and overrides other configs
    const sshdConfigContent = generateSSHDConfig();
    const sshdConfig = writeFile({
        name: "sshd-hardening-config",
        path: "/etc/ssh/sshd_config.d/99-syncreeper-hardening.conf",
        content: sshdConfigContent,
        mode: "600",
        owner: "root",
        group: "root",
        dependsOn,
    });
    resources.push(sshdConfig);

    // Create .ssh directory for syncreeper user
    const createSSHDir = runCommand({
        name: "ssh-dir-syncreeper",
        create: `
            mkdir -p ${getServiceUser().home}/.ssh
            chmod 700 ${getServiceUser().home}/.ssh
            chown ${getServiceUser().name}:${getServiceUser().name} ${getServiceUser().home}/.ssh
        `.trim(),
        dependsOn,
    });
    resources.push(createSSHDir);

    // Deploy authorized_keys for syncreeper user
    const authorizedKeysContent = generateAuthorizedKeys(authorizedKeys);
    const authorizedKeysFile = writeFile({
        name: "ssh-authorized-keys-syncreeper",
        path: `${getServiceUser().home}/.ssh/authorized_keys`,
        content: authorizedKeysContent,
        mode: "600",
        owner: getServiceUser().name,
        group: getServiceUser().name,
        dependsOn: [createSSHDir],
    });
    resources.push(authorizedKeysFile);

    // Validate sshd config before applying
    const validateConfig = runCommand({
        name: "ssh-validate-config",
        create: `
            sshd -t
            echo "SSH configuration validated successfully"
        `.trim(),
        dependsOn: [sshdConfig],
    });
    resources.push(validateConfig);

    // Restart sshd to apply changes
    // Using restart instead of reload to ensure all settings take effect
    const restartSSHD = runCommand({
        name: "ssh-restart-sshd",
        create: `
            systemctl restart sshd
            echo "SSH daemon restarted with hardened configuration"
        `.trim(),
        dependsOn: [validateConfig, authorizedKeysFile],
    });
    resources.push(restartSSHD);

    // Verify SSH is running with new config
    const verifySSH = runCommand({
        name: "ssh-verify",
        create: `
            systemctl is-active sshd
            echo "SSH hardening applied successfully"
            echo "  - Password authentication: disabled"
            echo "  - Root login: disabled"
            echo "  - Allowed users: ${getServiceUser().name}"
            echo "  - Authorized keys: ${authorizedKeys.length} key(s) deployed"
        `.trim(),
        dependsOn: [restartSSHD],
    });
    resources.push(verifySSH);

    return { resources };
}
