/**
 * Unit tests for config/types.ts platform routing logic
 *
 * Tests that getServiceUser(), getPaths(), and getDefaultConfig()
 * correctly route to Linux or Darwin implementations based on platform,
 * and that the configured username mechanism works.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @syncreeper/shared platform detection
const { mockIsLinux, mockIsMacOS } = vi.hoisted(() => ({
    mockIsLinux: vi.fn(() => false),
    mockIsMacOS: vi.fn(() => false),
}));

vi.mock("@syncreeper/shared", () => ({
    isLinux: mockIsLinux,
    isMacOS: mockIsMacOS,
}));

// Mock node:os for Darwin path functions (used internally by paths.darwin.ts)
vi.mock("node:os", () => ({
    userInfo: vi.fn(() => ({
        username: "darwinuser",
        uid: 501,
        gid: 20,
        shell: "/bin/zsh",
        homedir: "/Users/darwinuser",
    })),
    homedir: vi.fn(() => "/Users/darwinuser"),
    default: {
        userInfo: vi.fn(() => ({
            username: "darwinuser",
            uid: 501,
            gid: 20,
            shell: "/bin/zsh",
            homedir: "/Users/darwinuser",
        })),
        homedir: vi.fn(() => "/Users/darwinuser"),
    },
}));

import {
    setConfiguredUsername,
    getConfiguredUsername,
    getServiceUser,
    getPaths,
    getDefaultConfig,
} from "../../src/config/types";

describe("Config Types - Platform Routing", () => {
    beforeEach(() => {
        // Reset platform mocks and configured username
        mockIsLinux.mockReturnValue(false);
        mockIsMacOS.mockReturnValue(false);
        setConfiguredUsername(undefined);
    });

    // ========================================================================
    // Configured username state management
    // ========================================================================

    describe("setConfiguredUsername / getConfiguredUsername", () => {
        it("should return undefined by default", () => {
            expect(getConfiguredUsername()).toBeUndefined();
        });

        it("should store and retrieve a configured username", () => {
            setConfiguredUsername("myuser");
            expect(getConfiguredUsername()).toBe("myuser");
        });

        it("should allow clearing the configured username", () => {
            setConfiguredUsername("myuser");
            setConfiguredUsername(undefined);
            expect(getConfiguredUsername()).toBeUndefined();
        });
    });

    // ========================================================================
    // getServiceUser - platform routing
    // ========================================================================

    describe("getServiceUser", () => {
        it("should route to Linux implementation when isLinux() is true", () => {
            mockIsLinux.mockReturnValue(true);
            const user = getServiceUser();

            expect(user.name).toBe("syncreeper");
            expect(user.home).toBe("/home/syncreeper");
            expect(user.shell).toBe("/bin/bash");
        });

        it("should route to Darwin implementation when isMacOS() is true", () => {
            mockIsMacOS.mockReturnValue(true);
            const user = getServiceUser();

            expect(user.name).toBe("darwinuser");
            expect(user.shell).toBe("/bin/zsh");
        });

        it("should throw on unsupported platform", () => {
            // Neither isLinux nor isMacOS returns true
            expect(() => getServiceUser()).toThrow("Unsupported platform");
        });

        it("should pass explicit username override to Linux", () => {
            mockIsLinux.mockReturnValue(true);
            const user = getServiceUser("customuser");

            expect(user.name).toBe("customuser");
            expect(user.home).toBe("/home/customuser");
        });

        it("should pass explicit username override to Darwin", () => {
            mockIsMacOS.mockReturnValue(true);
            const user = getServiceUser("customuser");

            expect(user.name).toBe("customuser");
            expect(user.home).toBe("/Users/customuser");
        });

        it("should use configured username when no explicit override", () => {
            mockIsLinux.mockReturnValue(true);
            setConfiguredUsername("configured-user");
            const user = getServiceUser();

            expect(user.name).toBe("configured-user");
            expect(user.home).toBe("/home/configured-user");
        });

        it("should prefer explicit override over configured username", () => {
            mockIsLinux.mockReturnValue(true);
            setConfiguredUsername("configured-user");
            const user = getServiceUser("explicit-user");

            expect(user.name).toBe("explicit-user");
        });
    });

    // ========================================================================
    // getPaths - platform routing
    // ========================================================================

    describe("getPaths", () => {
        it("should route to Linux paths when isLinux() is true", () => {
            mockIsLinux.mockReturnValue(true);
            const paths = getPaths();

            expect(paths.syncApp).toContain("/home/syncreeper");
            expect(paths.userSystemd).toContain("systemd");
            expect(paths.launchAgents).toBe("");
        });

        it("should route to Darwin paths when isMacOS() is true", () => {
            mockIsMacOS.mockReturnValue(true);
            const paths = getPaths();

            expect(paths.syncApp).toContain("Library");
            expect(paths.userSystemd).toBe("");
            expect(paths.launchAgents).toContain("LaunchAgents");
        });

        it("should throw on unsupported platform", () => {
            expect(() => getPaths()).toThrow("Unsupported platform");
        });

        it("should use configured username for path derivation", () => {
            mockIsLinux.mockReturnValue(true);
            setConfiguredUsername("myuser");
            const paths = getPaths();

            expect(paths.syncApp).toContain("/home/myuser");
        });
    });

    // ========================================================================
    // getDefaultConfig - platform routing
    // ========================================================================

    describe("getDefaultConfig", () => {
        it("should route to Linux defaults when isLinux() is true", () => {
            mockIsLinux.mockReturnValue(true);
            const config = getDefaultConfig();

            expect(config.schedule).toBe("daily");
            expect(config.reposPath).toBe("/srv/repos");
            expect(config.syncthingFolderId).toBe("repos");
        });

        it("should route to Darwin defaults when isMacOS() is true", () => {
            mockIsMacOS.mockReturnValue(true);
            const config = getDefaultConfig();

            expect(config.schedule).toBe("daily");
            expect(config.reposPath).toContain("SyncReeper");
            expect(config.syncthingFolderId).toBe("repos");
        });

        it("should throw on unsupported platform", () => {
            expect(() => getDefaultConfig()).toThrow("Unsupported platform");
        });
    });
});
