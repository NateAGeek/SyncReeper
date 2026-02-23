/**
 * Unit tests for userCommand.utils.ts
 *
 * Tests the asServiceUser() and isRoot() utilities that handle
 * wrapping user-level commands when running as root.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// Use vi.hoisted to set up mock functions before vi.mock factories run
const { mockUserInfo } = vi.hoisted(() => ({
    mockUserInfo: vi.fn(() => ({
        username: "root",
        uid: 0,
        gid: 0,
        shell: "/bin/bash",
        homedir: "/root",
    })),
}));

const { mockExecaSync } = vi.hoisted(() => ({
    mockExecaSync: vi.fn(() => ({ stdout: "999" })),
}));

const { mockIsLinux } = vi.hoisted(() => ({
    mockIsLinux: vi.fn(() => true),
}));

vi.mock("node:os", () => ({
    userInfo: mockUserInfo,
}));

vi.mock("execa", () => ({
    execaSync: mockExecaSync,
}));

vi.mock("@syncreeper/shared", () => ({
    isLinux: mockIsLinux,
    DEFAULT_SERVICE_USER_LINUX: "syncreeper",
}));

// Must import AFTER mocks are set up
import {
    asServiceUser,
    asJournalctl,
    isRoot,
    _resetServiceUserCache,
} from "../../src/utils/userCommand.utils";

describe("userCommand.utils", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetServiceUserCache();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("isRoot()", () => {
        it("should return true when uid is 0 on Linux", () => {
            mockIsLinux.mockReturnValue(true);
            mockUserInfo.mockReturnValue({
                username: "root",
                uid: 0,
                gid: 0,
                shell: "/bin/bash",
                homedir: "/root",
            });

            expect(isRoot()).toBe(true);
        });

        it("should return false when uid is not 0 on Linux", () => {
            mockIsLinux.mockReturnValue(true);
            mockUserInfo.mockReturnValue({
                username: "syncreeper",
                uid: 999,
                gid: 999,
                shell: "/bin/bash",
                homedir: "/home/syncreeper",
            });

            expect(isRoot()).toBe(false);
        });

        it("should return false on macOS even if uid is 0", () => {
            mockIsLinux.mockReturnValue(false);
            mockUserInfo.mockReturnValue({
                username: "root",
                uid: 0,
                gid: 0,
                shell: "/bin/bash",
                homedir: "/var/root",
            });

            expect(isRoot()).toBe(false);
        });
    });

    describe("asServiceUser()", () => {
        it("should return command as-is when not root", () => {
            mockIsLinux.mockReturnValue(true);
            mockUserInfo.mockReturnValue({
                username: "syncreeper",
                uid: 999,
                gid: 999,
                shell: "/bin/bash",
                homedir: "/home/syncreeper",
            });

            const result = asServiceUser("systemctl", ["--user", "status", "syncthing"]);

            expect(result.command).toBe("systemctl");
            expect(result.args).toEqual(["--user", "status", "syncthing"]);
        });

        it("should return command as-is on macOS (isLinux false)", () => {
            mockIsLinux.mockReturnValue(false);
            mockUserInfo.mockReturnValue({
                username: "admin",
                uid: 501,
                gid: 20,
                shell: "/bin/zsh",
                homedir: "/Users/admin",
            });

            const result = asServiceUser("launchctl", ["list", "syncthing"]);

            expect(result.command).toBe("launchctl");
            expect(result.args).toEqual(["list", "syncthing"]);
        });

        it("should wrap command with sudo when root on Linux", () => {
            mockIsLinux.mockReturnValue(true);
            mockUserInfo.mockReturnValue({
                username: "root",
                uid: 0,
                gid: 0,
                shell: "/bin/bash",
                homedir: "/root",
            });
            mockExecaSync.mockReturnValue({ stdout: "999" });

            const result = asServiceUser("systemctl", ["--user", "status", "syncthing"]);

            expect(result.command).toBe("sudo");
            expect(result.args).toEqual([
                "-u",
                "syncreeper",
                "env",
                "XDG_RUNTIME_DIR=/run/user/999",
                "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/999/bus",
                "systemctl",
                "--user",
                "status",
                "syncthing",
            ]);
        });

        it("should wrap journalctl --user when root", () => {
            mockIsLinux.mockReturnValue(true);
            mockUserInfo.mockReturnValue({
                username: "root",
                uid: 0,
                gid: 0,
                shell: "/bin/bash",
                homedir: "/root",
            });
            mockExecaSync.mockReturnValue({ stdout: "999" });

            const result = asServiceUser("journalctl", [
                "--user",
                "-u",
                "syncreeper-sync",
                "-n",
                "100",
                "--no-pager",
            ]);

            expect(result.command).toBe("sudo");
            expect(result.args[0]).toBe("-u");
            expect(result.args[1]).toBe("syncreeper");
            expect(result.args).toContain("journalctl");
            expect(result.args).toContain("--user");
            expect(result.args).toContain("syncreeper-sync");
        });

        it("should wrap syncthing cli commands when root", () => {
            mockIsLinux.mockReturnValue(true);
            mockUserInfo.mockReturnValue({
                username: "root",
                uid: 0,
                gid: 0,
                shell: "/bin/bash",
                homedir: "/root",
            });
            mockExecaSync.mockReturnValue({ stdout: "999" });

            const result = asServiceUser("syncthing", ["cli", "show", "system"]);

            expect(result.command).toBe("sudo");
            expect(result.args).toContain("syncthing");
            expect(result.args).toContain("cli");
            expect(result.args).toContain("show");
            expect(result.args).toContain("system");
        });

        it("should return command as-is when service user cannot be resolved", () => {
            mockIsLinux.mockReturnValue(true);
            mockUserInfo.mockReturnValue({
                username: "root",
                uid: 0,
                gid: 0,
                shell: "/bin/bash",
                homedir: "/root",
            });
            mockExecaSync.mockImplementation(() => {
                throw new Error("id: syncreeper: no such user");
            });

            const result = asServiceUser("systemctl", ["--user", "status", "syncthing"]);

            expect(result.command).toBe("systemctl");
            expect(result.args).toEqual(["--user", "status", "syncthing"]);
        });

        it("should use the correct UID from id command output", () => {
            mockIsLinux.mockReturnValue(true);
            mockUserInfo.mockReturnValue({
                username: "root",
                uid: 0,
                gid: 0,
                shell: "/bin/bash",
                homedir: "/root",
            });
            mockExecaSync.mockReturnValue({ stdout: "1001" });

            const result = asServiceUser("systemctl", ["--user", "status", "syncthing"]);

            expect(result.args).toContain("XDG_RUNTIME_DIR=/run/user/1001");
            expect(result.args).toContain("DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus");
        });

        it("should cache service user lookup across calls", () => {
            mockIsLinux.mockReturnValue(true);
            mockUserInfo.mockReturnValue({
                username: "root",
                uid: 0,
                gid: 0,
                shell: "/bin/bash",
                homedir: "/root",
            });
            mockExecaSync.mockReturnValue({ stdout: "999" });

            asServiceUser("systemctl", ["--user", "status", "syncthing"]);
            asServiceUser("journalctl", ["--user", "-u", "sync"]);

            // execaSync should only be called once due to caching
            expect(mockExecaSync).toHaveBeenCalledTimes(1);
        });
    });

    describe("asJournalctl()", () => {
        it("should use --user -u when not root", () => {
            mockIsLinux.mockReturnValue(true);
            mockUserInfo.mockReturnValue({
                username: "syncreeper",
                uid: 999,
                gid: 999,
                shell: "/bin/bash",
                homedir: "/home/syncreeper",
            });

            const result = asJournalctl("syncreeper-sync.service", ["-n", "100", "--no-pager"]);

            expect(result.command).toBe("journalctl");
            expect(result.args).toEqual([
                "--user",
                "-u",
                "syncreeper-sync.service",
                "-n",
                "100",
                "--no-pager",
            ]);
        });

        it("should use _SYSTEMD_USER_UNIT filter when root", () => {
            mockIsLinux.mockReturnValue(true);
            mockUserInfo.mockReturnValue({
                username: "root",
                uid: 0,
                gid: 0,
                shell: "/bin/bash",
                homedir: "/root",
            });

            const result = asJournalctl("syncreeper-sync.service", ["-n", "100", "--no-pager"]);

            expect(result.command).toBe("journalctl");
            expect(result.args).toEqual([
                "_SYSTEMD_USER_UNIT=syncreeper-sync.service",
                "-n",
                "100",
                "--no-pager",
            ]);
            // Should NOT use sudo -u wrapper (that approach fails for journalctl)
            expect(result.command).not.toBe("sudo");
        });

        it("should use --user -u on macOS even with uid 0", () => {
            mockIsLinux.mockReturnValue(false);
            mockUserInfo.mockReturnValue({
                username: "root",
                uid: 0,
                gid: 0,
                shell: "/bin/bash",
                homedir: "/var/root",
            });

            const result = asJournalctl("syncreeper-sync.service", ["-n", "50"]);

            // isRoot() returns false on macOS, so standard --user approach
            expect(result.command).toBe("journalctl");
            expect(result.args).toEqual(["--user", "-u", "syncreeper-sync.service", "-n", "50"]);
        });

        it("should work with no extra args", () => {
            mockIsLinux.mockReturnValue(true);
            mockUserInfo.mockReturnValue({
                username: "root",
                uid: 0,
                gid: 0,
                shell: "/bin/bash",
                homedir: "/root",
            });

            const result = asJournalctl("syncthing.service");

            expect(result.command).toBe("journalctl");
            expect(result.args).toEqual(["_SYSTEMD_USER_UNIT=syncthing.service"]);
        });
    });
});
