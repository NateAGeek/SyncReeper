/**
 * Unit tests for auto-updates configuration generation
 *
 * Tests unattended-upgrades and apt auto-upgrades config generation.
 */

import { describe, it, expect, vi } from "vitest";

// Mock the command lib to avoid Pulumi resource creation
vi.mock("../../src/lib/command", () => ({
    runCommand: vi.fn(),
    writeFile: vi.fn(),
    enableService: vi.fn(),
}));

import {
    generateUnattendedUpgradesConfig,
    generateAutoUpgradesConfig,
} from "../../src/services/auto-updates/linux";

describe("Auto-Updates Config Generation", () => {
    describe("generateUnattendedUpgradesConfig", () => {
        it("should include security origins", () => {
            const config = generateUnattendedUpgradesConfig({ autoReboot: true });

            expect(config).toContain("Unattended-Upgrade::Allowed-Origins");
            expect(config).toContain("${distro_id}:${distro_codename}-security");
        });

        it("should include ESM origins", () => {
            const config = generateUnattendedUpgradesConfig({ autoReboot: true });

            expect(config).toContain("${distro_id}ESMApps:${distro_codename}-apps-security");
            expect(config).toContain("${distro_id}ESM:${distro_codename}-infra-security");
        });

        it("should enable auto-reboot when set to true", () => {
            const config = generateUnattendedUpgradesConfig({ autoReboot: true });

            expect(config).toContain('Unattended-Upgrade::Automatic-Reboot "true"');
        });

        it("should disable auto-reboot when set to false", () => {
            const config = generateUnattendedUpgradesConfig({ autoReboot: false });

            expect(config).toContain('Unattended-Upgrade::Automatic-Reboot "false"');
        });

        it("should set reboot time to 3 AM", () => {
            const config = generateUnattendedUpgradesConfig({ autoReboot: true });

            expect(config).toContain('Unattended-Upgrade::Automatic-Reboot-Time "03:00"');
        });

        it("should enable removal of unused kernel packages", () => {
            const config = generateUnattendedUpgradesConfig({ autoReboot: true });

            expect(config).toContain('Unattended-Upgrade::Remove-Unused-Kernel-Packages "true"');
        });

        it("should enable removal of unused dependencies", () => {
            const config = generateUnattendedUpgradesConfig({ autoReboot: true });

            expect(config).toContain('Unattended-Upgrade::Remove-Unused-Dependencies "true"');
        });

        it("should enable syslog logging", () => {
            const config = generateUnattendedUpgradesConfig({ autoReboot: true });

            expect(config).toContain('Unattended-Upgrade::SyslogEnable "true"');
        });

        it("should not install on shutdown", () => {
            const config = generateUnattendedUpgradesConfig({ autoReboot: true });

            expect(config).toContain('Unattended-Upgrade::InstallOnShutdown "false"');
        });
    });

    describe("generateAutoUpgradesConfig", () => {
        it("should enable daily package list updates", () => {
            const config = generateAutoUpgradesConfig();

            expect(config).toContain('APT::Periodic::Update-Package-Lists "1"');
        });

        it("should enable daily package downloads", () => {
            const config = generateAutoUpgradesConfig();

            expect(config).toContain('APT::Periodic::Download-Upgradeable-Packages "1"');
        });

        it("should set weekly autoclean interval", () => {
            const config = generateAutoUpgradesConfig();

            expect(config).toContain('APT::Periodic::AutocleanInterval "7"');
        });

        it("should enable unattended upgrades", () => {
            const config = generateAutoUpgradesConfig();

            expect(config).toContain('APT::Periodic::Unattended-Upgrade "1"');
        });

        it("should return non-empty string", () => {
            const config = generateAutoUpgradesConfig();

            expect(config.length).toBeGreaterThan(0);
            expect(typeof config).toBe("string");
        });
    });
});
