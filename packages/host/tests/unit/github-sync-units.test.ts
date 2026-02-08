/**
 * Unit tests for GitHub sync systemd/timer unit generation
 *
 * Tests the generation of systemd service unit, timer unit,
 * and convenience sync script.
 */

import { describe, it, expect, vi } from "vitest";

// Mock the config/types module to provide predictable paths
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
    copyFile: vi.fn(),
}));

vi.mock("../../src/lib/command.linux", () => ({
    enableUserServiceLinux: vi.fn(),
}));

// Mock node:fs to avoid filesystem checks
vi.mock("node:fs", () => ({
    existsSync: vi.fn(() => true),
}));

import {
    generateServiceUnit,
    generateTimerUnit,
    generateSyncScript,
} from "../../src/services/github-sync/linux";

describe("GitHub Sync Unit Generation", () => {
    describe("generateServiceUnit", () => {
        it("should have correct unit description", () => {
            const unit = generateServiceUnit("/srv/repos");

            expect(unit).toContain("Description=SyncReeper GitHub Repository Sync");
        });

        it("should depend on network being online", () => {
            const unit = generateServiceUnit("/srv/repos");

            expect(unit).toContain("After=network-online.target");
            expect(unit).toContain("Wants=network-online.target");
        });

        it("should be a oneshot service", () => {
            const unit = generateServiceUnit("/srv/repos");

            expect(unit).toContain("Type=oneshot");
        });

        it("should load environment file from secure location", () => {
            const unit = generateServiceUnit("/srv/repos");

            expect(unit).toContain("EnvironmentFile=/etc/syncreeper/sync.env");
        });

        it("should set working directory to sync app path", () => {
            const unit = generateServiceUnit("/srv/repos");

            expect(unit).toContain("WorkingDirectory=/home/syncreeper/.config/syncreeper/sync");
        });

        it("should execute the bundled sync app with node", () => {
            const unit = generateServiceUnit("/srv/repos");

            expect(unit).toContain(
                "ExecStart=/usr/local/bin/node /home/syncreeper/.config/syncreeper/sync/dist/bundle.js"
            );
        });

        it("should log to journal", () => {
            const unit = generateServiceUnit("/srv/repos");

            expect(unit).toContain("StandardOutput=journal");
            expect(unit).toContain("StandardError=journal");
            expect(unit).toContain("SyslogIdentifier=syncreeper-sync");
        });

        it("should enable security hardening", () => {
            const unit = generateServiceUnit("/srv/repos");

            expect(unit).toContain("NoNewPrivileges=yes");
            expect(unit).toContain("PrivateTmp=yes");
        });

        it("should install in default target", () => {
            const unit = generateServiceUnit("/srv/repos");

            expect(unit).toContain("WantedBy=default.target");
        });

        it("should have valid systemd unit sections", () => {
            const unit = generateServiceUnit("/srv/repos");

            expect(unit).toContain("[Unit]");
            expect(unit).toContain("[Service]");
            expect(unit).toContain("[Install]");
        });
    });

    describe("generateTimerUnit", () => {
        it("should have correct description", () => {
            const timer = generateTimerUnit("daily");

            expect(timer).toContain("Description=SyncReeper GitHub Sync Timer");
        });

        it("should require the sync service", () => {
            const timer = generateTimerUnit("daily");

            expect(timer).toContain("Requires=syncreeper-sync.service");
        });

        it("should convert 'daily' to 3 AM schedule", () => {
            const timer = generateTimerUnit("daily");

            expect(timer).toContain("OnCalendar=*-*-* 03:00:00");
        });

        it("should convert 'hourly' to top-of-hour schedule", () => {
            const timer = generateTimerUnit("hourly");

            expect(timer).toContain("OnCalendar=*-*-* *:00:00");
        });

        it("should pass through custom OnCalendar expressions", () => {
            const timer = generateTimerUnit("*-*-* 06:30:00");

            expect(timer).toContain("OnCalendar=*-*-* 06:30:00");
        });

        it("should add randomized delay", () => {
            const timer = generateTimerUnit("daily");

            expect(timer).toContain("RandomizedDelaySec=900");
        });

        it("should enable persistent catch-up", () => {
            const timer = generateTimerUnit("daily");

            expect(timer).toContain("Persistent=true");
        });

        it("should install in timers target", () => {
            const timer = generateTimerUnit("daily");

            expect(timer).toContain("WantedBy=timers.target");
        });

        it("should have valid systemd unit sections", () => {
            const timer = generateTimerUnit("daily");

            expect(timer).toContain("[Unit]");
            expect(timer).toContain("[Timer]");
            expect(timer).toContain("[Install]");
        });
    });

    describe("generateSyncScript", () => {
        it("should be a bash script", () => {
            const script = generateSyncScript("syncreeper");

            expect(script).toMatch(/^#!/);
            expect(script).toContain("#!/bin/bash");
        });

        it("should use set -e for strict error handling", () => {
            const script = generateSyncScript("syncreeper");

            expect(script).toContain("set -e");
        });

        it("should check current user matches expected user", () => {
            const script = generateSyncScript("syncreeper");

            expect(script).toContain("CURRENT_USER=$(whoami)");
            expect(script).toContain('"$CURRENT_USER" != "syncreeper"');
        });

        it("should show usage instructions on wrong user", () => {
            const script = generateSyncScript("syncreeper");

            expect(script).toContain("sudo -u syncreeper sync-repos");
            expect(script).toContain("ssh syncreeper@your-vps sync-repos");
        });

        it("should exit with code 1 on wrong user", () => {
            const script = generateSyncScript("syncreeper");

            expect(script).toContain("exit 1");
        });

        it("should trigger sync via user systemd service", () => {
            const script = generateSyncScript("syncreeper");

            expect(script).toContain("systemctl --user start syncreeper-sync.service");
        });

        it("should show log viewing instructions", () => {
            const script = generateSyncScript("syncreeper");

            expect(script).toContain("journalctl --user -u syncreeper-sync -f");
        });

        it("should use the provided username throughout", () => {
            const script = generateSyncScript("myuser");

            expect(script).toContain('"$CURRENT_USER" != "myuser"');
            expect(script).toContain("sudo -u myuser sync-repos");
            expect(script).toContain("ssh myuser@your-vps sync-repos");
        });
    });
});
