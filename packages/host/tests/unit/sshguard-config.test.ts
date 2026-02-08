/**
 * Unit tests for SSHGuard configuration generation
 *
 * Tests whitelist content generation for both Linux and macOS.
 */

import { describe, it, expect, vi } from "vitest";

// Mock the command lib to avoid Pulumi resource creation
vi.mock("../../src/lib/command", () => ({
    runCommand: vi.fn(),
    enableService: vi.fn(),
}));

// Mock darwin-specific command lib
vi.mock("../../src/lib/command.darwin", () => ({
    enableBrewService: vi.fn(),
}));

import { generateWhitelistContent as generateWhitelistLinux } from "../../src/services/sshguard/linux";
import { generateWhitelistContent as generateWhitelistDarwin } from "../../src/services/sshguard/darwin";
import { SSHGUARD_CONFIG } from "../../src/services/sshguard/types";

describe("SSHGuard Config Generation", () => {
    describe("SSHGUARD_CONFIG defaults", () => {
        it("should have a 2-hour initial block time", () => {
            expect(SSHGUARD_CONFIG.blockTime).toBe(7200);
        });

        it("should have a 1.5x block time multiplier", () => {
            expect(SSHGUARD_CONFIG.blockTimeMultiplier).toBe(1.5);
        });

        it("should have a threshold of 30", () => {
            expect(SSHGUARD_CONFIG.threshold).toBe(30);
        });

        it("should have a 30-minute detection time", () => {
            expect(SSHGUARD_CONFIG.detectionTime).toBe(1800);
        });

        it("should whitelist localhost IPv4 and IPv6", () => {
            expect(SSHGUARD_CONFIG.whitelist).toContain("127.0.0.0/8");
            expect(SSHGUARD_CONFIG.whitelist).toContain("::1/128");
        });
    });

    describe("Linux generateWhitelistContent", () => {
        it("should include header comment", () => {
            const content = generateWhitelistLinux();

            expect(content).toContain("# SSHGuard whitelist");
            expect(content).toContain("# Never block these addresses");
        });

        it("should include localhost IPv4 range", () => {
            const content = generateWhitelistLinux();

            expect(content).toContain("127.0.0.0/8");
        });

        it("should include localhost IPv6", () => {
            const content = generateWhitelistLinux();

            expect(content).toContain("::1/128");
        });

        it("should include all whitelisted addresses from config", () => {
            const content = generateWhitelistLinux();

            for (const addr of SSHGUARD_CONFIG.whitelist) {
                expect(content).toContain(addr);
            }
        });

        it("should produce newline-separated output", () => {
            const content = generateWhitelistLinux();
            const lines = content.split("\n");

            // Header, description, empty, addresses, trailing empty
            expect(lines.length).toBeGreaterThanOrEqual(4);
        });
    });

    describe("macOS generateWhitelistContent", () => {
        it("should include header comment", () => {
            const content = generateWhitelistDarwin();

            expect(content).toContain("# SSHGuard whitelist");
            expect(content).toContain("# Never block these addresses");
        });

        it("should include localhost addresses", () => {
            const content = generateWhitelistDarwin();

            expect(content).toContain("127.0.0.0/8");
            expect(content).toContain("::1/128");
        });

        it("should produce identical content to Linux version", () => {
            // Both platforms use the same SSHGUARD_CONFIG, so whitelists should match
            const linuxContent = generateWhitelistLinux();
            const darwinContent = generateWhitelistDarwin();

            expect(linuxContent).toBe(darwinContent);
        });
    });
});
