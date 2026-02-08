/**
 * Unit tests for macOS GitHub sync service generation
 *
 * Tests the pure generation functions for launchd plist,
 * calendar interval conversion, and convenience sync script.
 */

import { describe, it, expect, vi } from "vitest";

// Mock the config/types module to provide predictable paths
vi.mock("../../src/config/types", () => ({
    getServiceUser: vi.fn(() => ({
        name: "darwinuser",
        home: "/Users/darwinuser",
        shell: "/bin/zsh",
    })),
    getPaths: vi.fn(() => ({
        syncApp: "/Users/darwinuser/Library/Application Support/SyncReeper/sync",
        syncScript: "/Users/darwinuser/.local/bin/sync-repos",
        syncthingConfig: "/Users/darwinuser/Library/Application Support/Syncthing",
        logDir: "/Users/darwinuser/Library/Logs/SyncReeper",
        envDir: "/Users/darwinuser/Library/Application Support/SyncReeper/config",
        userSystemd: "",
        launchAgents: "/Users/darwinuser/Library/LaunchAgents",
    })),
}));

// Mock command libs to avoid Pulumi resource creation
vi.mock("../../src/lib/command", () => ({
    runCommand: vi.fn(),
    writeFile: vi.fn(),
    copyFile: vi.fn(),
}));

vi.mock("../../src/lib/command.darwin", () => ({
    enableServiceDarwin: vi.fn(),
}));

// Mock node:fs to avoid filesystem checks
vi.mock("node:fs", () => ({
    existsSync: vi.fn(() => true),
}));

import {
    getCalendarInterval,
    generateLaunchdPlist,
    generateSyncScript,
} from "../../src/services/github-sync/darwin";
import { getPaths } from "../../src/config/types";
import type { SyncReeperConfig } from "../../src/config/types";

// Helper to create a mock config
function createMockConfig(overrides: Partial<SyncReeperConfig> = {}): SyncReeperConfig {
    return {
        github: { token: "ghp_test123", username: "testuser" },
        syncthing: { trustedDevices: ["DEVICE-ID-1"], folderId: "repos" },
        ssh: { authorizedKeys: ["ssh-ed25519 AAAAC3..."] },
        sync: { schedule: "daily", reposPath: "/Users/darwinuser/SyncReeper/repos" },
        serviceUser: "darwinuser",
        ...overrides,
    };
}

describe("macOS GitHub Sync Generation", () => {
    const paths = getPaths();

    describe("getCalendarInterval", () => {
        it("should convert 'daily' to 3 AM", () => {
            const interval = getCalendarInterval("daily");
            expect(interval).toEqual({ Hour: 3, Minute: 0 });
        });

        it("should convert 'hourly' to top of every hour", () => {
            const interval = getCalendarInterval("hourly");
            expect(interval).toEqual({ Minute: 0 });
        });

        it("should not include Hour for hourly schedule", () => {
            const interval = getCalendarInterval("hourly");
            expect(interval).not.toHaveProperty("Hour");
        });

        it("should default to daily (3 AM) for unknown schedule strings", () => {
            const interval = getCalendarInterval("every-5-minutes");
            expect(interval).toEqual({ Hour: 3, Minute: 0 });
        });
    });

    describe("generateLaunchdPlist", () => {
        it("should produce valid XML plist header", () => {
            const config = createMockConfig();
            const plist = generateLaunchdPlist(config, paths);

            expect(plist).toContain('<?xml version="1.0" encoding="UTF-8"?>');
            expect(plist).toContain("<!DOCTYPE plist");
            expect(plist).toContain('<plist version="1.0">');
        });

        it("should set the Label to com.syncreeper.sync", () => {
            const config = createMockConfig();
            const plist = generateLaunchdPlist(config, paths);

            expect(plist).toContain("<key>Label</key>");
            expect(plist).toContain("<string>com.syncreeper.sync</string>");
        });

        it("should include ProgramArguments with node and bundle.js", () => {
            const config = createMockConfig();
            const plist = generateLaunchdPlist(config, paths);

            expect(plist).toContain("<key>ProgramArguments</key>");
            expect(plist).toContain("node</string>");
            expect(plist).toContain("bundle.js</string>");
        });

        it("should set WorkingDirectory to syncApp path", () => {
            const config = createMockConfig();
            const plist = generateLaunchdPlist(config, paths);

            expect(plist).toContain("<key>WorkingDirectory</key>");
            expect(plist).toContain(paths.syncApp);
        });

        it("should include StartCalendarInterval with daily schedule", () => {
            const config = createMockConfig();
            const plist = generateLaunchdPlist(config, paths);

            expect(plist).toContain("<key>StartCalendarInterval</key>");
            expect(plist).toContain("<key>Hour</key>");
            expect(plist).toContain("<integer>3</integer>");
            expect(plist).toContain("<key>Minute</key>");
            expect(plist).toContain("<integer>0</integer>");
        });

        it("should include StartCalendarInterval with hourly schedule", () => {
            const config = createMockConfig({
                sync: { schedule: "hourly", reposPath: "/Users/darwinuser/SyncReeper/repos" },
            });
            const plist = generateLaunchdPlist(config, paths);

            expect(plist).toContain("<key>Minute</key>");
            expect(plist).not.toContain("<key>Hour</key>");
        });

        it("should configure log output paths", () => {
            const config = createMockConfig();
            const plist = generateLaunchdPlist(config, paths);

            expect(plist).toContain("<key>StandardOutPath</key>");
            expect(plist).toContain("sync.log</string>");
            expect(plist).toContain("<key>StandardErrorPath</key>");
            expect(plist).toContain("sync.error.log</string>");
        });

        it("should set RunAtLoad to false", () => {
            const config = createMockConfig();
            const plist = generateLaunchdPlist(config, paths);

            expect(plist).toContain("<key>RunAtLoad</key>");
            expect(plist).toContain("<false/>");
        });

        it("should include PATH environment variable", () => {
            const config = createMockConfig();
            const plist = generateLaunchdPlist(config, paths);

            expect(plist).toContain("<key>EnvironmentVariables</key>");
            expect(plist).toContain("<key>PATH</key>");
            expect(plist).toContain("/opt/homebrew/bin");
        });
    });

    describe("generateSyncScript", () => {
        it("should be a bash script", () => {
            const script = generateSyncScript(paths);

            expect(script).toContain("#!/bin/bash");
        });

        it("should use set -e for strict error handling", () => {
            const script = generateSyncScript(paths);

            expect(script).toContain("set -e");
        });

        it("should source the environment file", () => {
            const script = generateSyncScript(paths);

            expect(script).toContain("sync.env");
            expect(script).toContain(paths.envDir);
        });

        it("should change to the syncApp directory", () => {
            const script = generateSyncScript(paths);

            expect(script).toContain(`cd "${paths.syncApp}"`);
        });

        it("should run node with bundle.js", () => {
            const script = generateSyncScript(paths);

            expect(script).toContain("node dist/bundle.js");
        });

        it("should display sync status messages", () => {
            const script = generateSyncScript(paths);

            expect(script).toContain("Starting manual sync");
            expect(script).toContain("Sync complete");
        });
    });
});
