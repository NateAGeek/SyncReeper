/**
 * Unit tests for platform detection utilities
 *
 * Tests all functions exported from platform.ts.
 * Uses process.platform mocking to simulate different OS environments
 * (tests run on Windows but code targets Linux/macOS).
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// Use vi.hoisted so mock functions are available when vi.mock factory runs
const { mockUserInfo, mockHomedir } = vi.hoisted(() => ({
    mockUserInfo: vi.fn(() => ({
        username: "realuser",
        uid: 1000,
        gid: 1000,
        shell: "/bin/bash",
        homedir: "/home/realuser",
    })),
    mockHomedir: vi.fn(() => "/home/realuser"),
}));

vi.mock("node:os", () => ({
    userInfo: mockUserInfo,
    homedir: mockHomedir,
}));

import {
    detectPlatform,
    isLinux,
    isMacOS,
    isWindows,
    getPlatformDisplayName,
    getCurrentUsername,
    getHomeDirectory,
    isSupportedPlatform,
    assertSupportedPlatform,
    logPlatformBanner,
} from "../../src/platform";

describe("Platform Detection Utilities", () => {
    const originalPlatform = process.platform;

    afterEach(() => {
        // Restore original platform
        Object.defineProperty(process, "platform", { value: originalPlatform });
        vi.restoreAllMocks();
    });

    describe("detectPlatform", () => {
        it("should return 'linux' on Linux", () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            expect(detectPlatform()).toBe("linux");
        });

        it("should return 'darwin' on macOS", () => {
            Object.defineProperty(process, "platform", { value: "darwin" });
            expect(detectPlatform()).toBe("darwin");
        });

        it("should return 'win32' on Windows", () => {
            Object.defineProperty(process, "platform", { value: "win32" });
            expect(detectPlatform()).toBe("win32");
        });
    });

    describe("isLinux", () => {
        it("should return true on Linux", () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            expect(isLinux()).toBe(true);
        });

        it("should return false on macOS", () => {
            Object.defineProperty(process, "platform", { value: "darwin" });
            expect(isLinux()).toBe(false);
        });

        it("should return false on Windows", () => {
            Object.defineProperty(process, "platform", { value: "win32" });
            expect(isLinux()).toBe(false);
        });
    });

    describe("isMacOS", () => {
        it("should return true on macOS", () => {
            Object.defineProperty(process, "platform", { value: "darwin" });
            expect(isMacOS()).toBe(true);
        });

        it("should return false on Linux", () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            expect(isMacOS()).toBe(false);
        });

        it("should return false on Windows", () => {
            Object.defineProperty(process, "platform", { value: "win32" });
            expect(isMacOS()).toBe(false);
        });
    });

    describe("isWindows", () => {
        it("should return true on Windows", () => {
            Object.defineProperty(process, "platform", { value: "win32" });
            expect(isWindows()).toBe(true);
        });

        it("should return false on Linux", () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            expect(isWindows()).toBe(false);
        });

        it("should return false on macOS", () => {
            Object.defineProperty(process, "platform", { value: "darwin" });
            expect(isWindows()).toBe(false);
        });
    });

    describe("getPlatformDisplayName", () => {
        it("should return 'Linux' for linux platform", () => {
            expect(getPlatformDisplayName("linux")).toBe("Linux");
        });

        it("should return 'macOS' for darwin platform", () => {
            expect(getPlatformDisplayName("darwin")).toBe("macOS");
        });

        it("should return 'Windows' for win32 platform", () => {
            expect(getPlatformDisplayName("win32")).toBe("Windows");
        });

        it("should return 'Unknown (...)' for unrecognized platform", () => {
            const result = getPlatformDisplayName("freebsd" as any);
            expect(result).toBe("Unknown (freebsd)");
        });

        it("should auto-detect platform when no argument is provided", () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            expect(getPlatformDisplayName()).toBe("Linux");
        });
    });

    describe("getCurrentUsername", () => {
        it("should return the current username from os.userInfo()", () => {
            mockUserInfo.mockReturnValue({
                username: "testuser",
                uid: 1000,
                gid: 1000,
                shell: "/bin/bash",
                homedir: "/home/testuser",
            });

            expect(getCurrentUsername()).toBe("testuser");
        });
    });

    describe("getHomeDirectory", () => {
        it("should return the home directory from os.homedir()", () => {
            mockHomedir.mockReturnValue("/home/testuser");
            expect(getHomeDirectory()).toBe("/home/testuser");
        });

        it("should return macOS-style home directory", () => {
            mockHomedir.mockReturnValue("/Users/testuser");
            expect(getHomeDirectory()).toBe("/Users/testuser");
        });
    });

    describe("isSupportedPlatform", () => {
        it("should return true on Linux", () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            expect(isSupportedPlatform()).toBe(true);
        });

        it("should return true on macOS", () => {
            Object.defineProperty(process, "platform", { value: "darwin" });
            expect(isSupportedPlatform()).toBe(true);
        });

        it("should return false on Windows", () => {
            Object.defineProperty(process, "platform", { value: "win32" });
            expect(isSupportedPlatform()).toBe(false);
        });

        it("should return false on unsupported platforms", () => {
            Object.defineProperty(process, "platform", { value: "freebsd" });
            expect(isSupportedPlatform()).toBe(false);
        });
    });

    describe("assertSupportedPlatform", () => {
        it("should not throw on Linux", () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            expect(() => assertSupportedPlatform()).not.toThrow();
        });

        it("should not throw on macOS", () => {
            Object.defineProperty(process, "platform", { value: "darwin" });
            expect(() => assertSupportedPlatform()).not.toThrow();
        });

        it("should throw with WSL2 suggestion on Windows", () => {
            Object.defineProperty(process, "platform", { value: "win32" });
            expect(() => assertSupportedPlatform()).toThrow(
                "Windows is not supported for local SyncReeper deployment"
            );
            expect(() => assertSupportedPlatform()).toThrow("WSL2");
        });

        it("should throw with platform name on other unsupported platforms", () => {
            Object.defineProperty(process, "platform", { value: "freebsd" });
            expect(() => assertSupportedPlatform()).toThrow("Unsupported platform: freebsd");
        });
    });

    describe("logPlatformBanner", () => {
        it("should log a banner with the platform display name", () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            logPlatformBanner();

            const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(output).toContain("SyncReeper");
            expect(output).toContain("Linux");
            expect(output).toContain("====");
        });

        it("should display macOS name in banner", () => {
            Object.defineProperty(process, "platform", { value: "darwin" });
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            logPlatformBanner();

            const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(output).toContain("macOS");
        });
    });
});
