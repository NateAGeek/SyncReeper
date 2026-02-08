/**
 * Unit tests for SSH configuration generation
 *
 * Tests the pure generation functions for SSH hardening config
 * and authorized_keys file content.
 */

import { describe, it, expect, vi } from "vitest";

// Mock the config/types module to avoid platform detection and Pulumi config
vi.mock("../../src/config/types", () => ({
    getServiceUser: vi.fn(() => ({
        name: "syncreeper",
        home: "/home/syncreeper",
        shell: "/bin/bash",
    })),
    getPaths: vi.fn(() => ({
        syncApp: "/home/syncreeper/.config/syncreeper/sync",
        syncScript: "/usr/local/bin/sync-repos",
        syncthingConfig: "/home/syncreeper/.config/syncthing",
        logDir: "/var/log/syncreeper",
        envDir: "/etc/syncreeper",
        userSystemd: "/home/syncreeper/.config/systemd/user",
        launchAgents: "",
    })),
}));

// Mock the command lib to avoid Pulumi resource creation
vi.mock("../../src/lib/command", () => ({
    runCommand: vi.fn(),
    writeFile: vi.fn(),
}));

import {
    generateSSHDConfig,
    generateAuthorizedKeys,
    getSSHDHardeningConfig,
} from "../../src/services/ssh/index";

describe("SSH Config Generation", () => {
    describe("getSSHDHardeningConfig", () => {
        it("should return hardening config with correct defaults", () => {
            const config = getSSHDHardeningConfig();

            expect(config.permitRootLogin).toBe("no");
            expect(config.passwordAuthentication).toBe("no");
            expect(config.pubkeyAuthentication).toBe("yes");
            expect(config.authenticationMethods).toBe("publickey");
            expect(config.maxAuthTries).toBe(3);
            expect(config.allowUsers).toBe("syncreeper");
            expect(config.clientAliveInterval).toBe(300);
            expect(config.clientAliveCountMax).toBe(2);
            expect(config.loginGraceTime).toBe(60);
            expect(config.x11Forwarding).toBe("no");
            expect(config.allowAgentForwarding).toBe("no");
            expect(config.allowTcpForwarding).toBe("no");
            expect(config.permitTunnel).toBe("no");
            expect(config.logLevel).toBe("VERBOSE");
        });

        it("should use the service user name for allowUsers", () => {
            const config = getSSHDHardeningConfig();
            expect(config.allowUsers).toBe("syncreeper");
        });
    });

    describe("generateSSHDConfig", () => {
        it("should generate valid sshd_config content", () => {
            const config = generateSSHDConfig();

            // Should have the header comment
            expect(config).toContain("# SyncReeper SSH Hardening Configuration");
            expect(config).toContain("# Managed by Pulumi - Do not edit manually");
        });

        it("should disable root login", () => {
            const config = generateSSHDConfig();
            expect(config).toContain("PermitRootLogin no");
        });

        it("should disable password authentication", () => {
            const config = generateSSHDConfig();
            expect(config).toContain("PasswordAuthentication no");
        });

        it("should enable pubkey authentication", () => {
            const config = generateSSHDConfig();
            expect(config).toContain("PubkeyAuthentication yes");
        });

        it("should set authentication methods to publickey only", () => {
            const config = generateSSHDConfig();
            expect(config).toContain("AuthenticationMethods publickey");
        });

        it("should limit max auth tries", () => {
            const config = generateSSHDConfig();
            expect(config).toContain("MaxAuthTries 3");
        });

        it("should restrict to service user", () => {
            const config = generateSSHDConfig();
            expect(config).toContain("AllowUsers syncreeper");
        });

        it("should configure session security", () => {
            const config = generateSSHDConfig();
            expect(config).toContain("ClientAliveInterval 300");
            expect(config).toContain("ClientAliveCountMax 2");
            expect(config).toContain("LoginGraceTime 60");
        });

        it("should disable unnecessary features", () => {
            const config = generateSSHDConfig();
            expect(config).toContain("X11Forwarding no");
            expect(config).toContain("AllowAgentForwarding no");
            expect(config).toContain("AllowTcpForwarding no");
            expect(config).toContain("PermitTunnel no");
        });

        it("should disable interactive auth methods", () => {
            const config = generateSSHDConfig();
            expect(config).toContain("KbdInteractiveAuthentication no");
            expect(config).toContain("ChallengeResponseAuthentication no");
        });

        it("should enable PAM", () => {
            const config = generateSSHDConfig();
            expect(config).toContain("UsePAM yes");
        });

        it("should set verbose logging", () => {
            const config = generateSSHDConfig();
            expect(config).toContain("LogLevel VERBOSE");
        });

        it("should have section headers", () => {
            const config = generateSSHDConfig();
            expect(config).toContain("# === Authentication ===");
            expect(config).toContain("# === User Restrictions ===");
            expect(config).toContain("# === Session Security ===");
            expect(config).toContain("# === Disable Unnecessary Features ===");
            expect(config).toContain("# === Logging ===");
        });
    });

    describe("generateAuthorizedKeys", () => {
        it("should generate authorized_keys content with header", () => {
            const keys = ["ssh-ed25519 AAAA... user@host"];
            const content = generateAuthorizedKeys(keys);

            expect(content).toContain("# SyncReeper Authorized SSH Keys");
            expect(content).toContain("# Managed by Pulumi - Do not edit manually");
        });

        it("should include all provided keys", () => {
            const keys = [
                "ssh-ed25519 AAAA1111 user1@host1",
                "ssh-rsa BBBB2222 user2@host2",
                "ssh-ed25519 CCCC3333 user3@host3",
            ];
            const content = generateAuthorizedKeys(keys);

            for (const key of keys) {
                expect(content).toContain(key);
            }
        });

        it("should handle a single key", () => {
            const keys = ["ssh-ed25519 AAAA... user@host"];
            const content = generateAuthorizedKeys(keys);

            expect(content).toContain("ssh-ed25519 AAAA... user@host");
        });

        it("should handle empty keys array", () => {
            const content = generateAuthorizedKeys([]);

            // Should still have the header
            expect(content).toContain("# SyncReeper Authorized SSH Keys");
            // Should not crash
            expect(typeof content).toBe("string");
        });

        it("should produce newline-separated output", () => {
            const keys = ["key1", "key2"];
            const content = generateAuthorizedKeys(keys);
            const lines = content.split("\n");

            // Header comment, managed comment, empty line, key1, key2, trailing empty
            expect(lines.length).toBeGreaterThanOrEqual(5);
        });
    });
});
