/**
 * Unit tests for Syncthing CLI configuration script generation
 *
 * Tests the generateSyncthingCliConfigScript functions for both
 * Linux and macOS. These generate bash scripts that configure
 * Syncthing devices and folders via the syncthing CLI.
 */

import { describe, it, expect, vi } from "vitest";

// Mock config/types for both platform modules
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

// Mock command libs to avoid Pulumi resource creation
vi.mock("../../src/lib/command", () => ({
    runCommand: vi.fn(),
    writeFile: vi.fn(),
    enableService: vi.fn(),
}));

vi.mock("../../src/lib/command.darwin", () => ({
    enableBrewService: vi.fn(),
}));

import { generateSyncthingCliConfigScript as generateLinuxScript } from "../../src/services/syncthing/linux";
import { generateSyncthingCliConfigScript as generateDarwinScript } from "../../src/services/syncthing/darwin";

describe("Syncthing CLI Config Script Generation", () => {
    // ========================================================================
    // Linux version
    // ========================================================================

    describe("Linux - generateSyncthingCliConfigScript", () => {
        it("should be a bash script with shebang", () => {
            const script = generateLinuxScript([], "repos", "/srv/repos", "syncreeper");
            expect(script).toContain("#!/bin/bash");
        });

        it("should use set -e for strict error handling", () => {
            const script = generateLinuxScript([], "repos", "/srv/repos", "syncreeper");
            expect(script).toContain("set -e");
        });

        it("should remove the default folder", () => {
            const script = generateLinuxScript([], "repos", "/srv/repos", "syncreeper");
            expect(script).toContain('folders remove "default"');
        });

        it("should create a folder with the specified ID and path", () => {
            const script = generateLinuxScript([], "my-repos", "/data/repos", "syncreeper");
            expect(script).toContain('--id "my-repos"');
            expect(script).toContain('--path "/data/repos"');
            expect(script).toContain('--label "GitHub Repositories"');
        });

        it("should use sudo -u username for syncthing CLI commands", () => {
            const script = generateLinuxScript(["DEV-ID-1"], "repos", "/srv/repos", "syncreeper");
            expect(script).toContain("sudo -u syncreeper syncthing cli");
        });

        it("should add trusted devices with correct naming", () => {
            const devices = ["DEVICE-AAA-111", "DEVICE-BBB-222"];
            const script = generateLinuxScript(devices, "repos", "/srv/repos", "syncreeper");

            expect(script).toContain("Device-1");
            expect(script).toContain("Device-2");
            expect(script).toContain('--device-id "DEVICE-AAA-111"');
            expect(script).toContain('--device-id "DEVICE-BBB-222"');
            expect(script).toContain('--name "Device-1"');
            expect(script).toContain('--name "Device-2"');
        });

        it("should share the folder with each trusted device", () => {
            const devices = ["DEVICE-AAA-111"];
            const script = generateLinuxScript(devices, "repos", "/srv/repos", "syncreeper");

            expect(script).toContain('folders "repos" devices add');
            expect(script).toContain('--device-id "DEVICE-AAA-111"');
        });

        it("should handle empty trusted devices array", () => {
            const script = generateLinuxScript([], "repos", "/srv/repos", "syncreeper");

            expect(script).toContain("#!/bin/bash");
            expect(script).toContain("folders add");
            // No device add commands
            expect(script).not.toContain("--device-id");
        });

        it("should use the provided username throughout", () => {
            const script = generateLinuxScript(["DEV-1"], "repos", "/srv/repos", "myuser");
            expect(script).toContain("sudo -u myuser");
        });

        it("should include error-tolerant device add (|| echo continuation)", () => {
            const script = generateLinuxScript(["DEV-1"], "repos", "/srv/repos", "syncreeper");
            expect(script).toContain('|| echo "Device may already exist');
        });
    });

    // ========================================================================
    // Darwin (macOS) version
    // ========================================================================

    describe("Darwin - generateSyncthingCliConfigScript", () => {
        it("should be a bash script with shebang", () => {
            const script = generateDarwinScript([], "repos", "/Users/me/repos", "/config");
            expect(script).toContain("#!/bin/bash");
        });

        it("should use set -e for strict error handling", () => {
            const script = generateDarwinScript([], "repos", "/Users/me/repos", "/config");
            expect(script).toContain("set -e");
        });

        it("should NOT use sudo (runs as current user on macOS)", () => {
            const devices = ["DEV-1"];
            const script = generateDarwinScript(devices, "repos", "/Users/me/repos", "/config");

            // Darwin version uses direct syncthing cli, not sudo -u
            expect(script).not.toContain("sudo -u");
        });

        it("should include export HOME for macOS environment", () => {
            const script = generateDarwinScript([], "repos", "/Users/me/repos", "/config");
            expect(script).toContain('export HOME="$HOME"');
        });

        it("should remove the default folder", () => {
            const script = generateDarwinScript([], "repos", "/Users/me/repos", "/config");
            expect(script).toContain('folders remove "default"');
        });

        it("should create a folder with the specified ID and path", () => {
            const script = generateDarwinScript([], "my-repos", "/Users/me/data", "/config");
            expect(script).toContain('--id "my-repos"');
            expect(script).toContain('--path "/Users/me/data"');
        });

        it("should add trusted devices", () => {
            const devices = ["MAC-DEVICE-1", "MAC-DEVICE-2"];
            const script = generateDarwinScript(devices, "repos", "/Users/me/repos", "/config");

            expect(script).toContain('--device-id "MAC-DEVICE-1"');
            expect(script).toContain('--device-id "MAC-DEVICE-2"');
            expect(script).toContain("Device-1");
            expect(script).toContain("Device-2");
        });

        it("should share the folder with each trusted device", () => {
            const devices = ["MAC-DEVICE-1"];
            const script = generateDarwinScript(devices, "repos", "/Users/me/repos", "/config");

            expect(script).toContain('folders "repos" devices add');
        });

        it("should handle empty trusted devices array", () => {
            const script = generateDarwinScript([], "repos", "/Users/me/repos", "/config");

            expect(script).toContain("#!/bin/bash");
            expect(script).not.toContain("--device-id");
        });
    });

    // ========================================================================
    // Cross-platform consistency
    // ========================================================================

    describe("Cross-platform consistency", () => {
        it("should produce scripts with the same overall structure", () => {
            const linuxScript = generateLinuxScript(["DEV-1"], "repos", "/srv/repos", "syncreeper");
            const darwinScript = generateDarwinScript(
                ["DEV-1"],
                "repos",
                "/Users/me/repos",
                "/config"
            );

            // Both should have the same logical sections
            for (const section of [
                "#!/bin/bash",
                "set -e",
                "Removing default folder",
                "Creating folder",
                "Adding trusted devices",
                "Sharing folder with trusted devices",
                "Syncthing CLI configuration complete",
            ]) {
                expect(linuxScript).toContain(section);
                expect(darwinScript).toContain(section);
            }
        });
    });
});
