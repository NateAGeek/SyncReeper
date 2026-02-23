/**
 * Unit tests for service-user.utils.ts
 *
 * Tests the resolveServiceUser() and getDefaultServiceUser() functions.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// Use vi.hoisted for mock setup before vi.mock factory runs
const { mockUserInfo } = vi.hoisted(() => ({
    mockUserInfo: vi.fn(() => ({
        username: "testuser",
        uid: 1000,
        gid: 1000,
        shell: "/bin/bash",
        homedir: "/home/testuser",
    })),
}));

const { mockExeca } = vi.hoisted(() => ({
    mockExeca: vi.fn(),
}));

vi.mock("node:os", () => ({
    userInfo: mockUserInfo,
}));

vi.mock("execa", () => ({
    execa: mockExeca,
}));

vi.mock("@syncreeper/shared", () => ({
    DEFAULT_SERVICE_USER_LINUX: "syncreeper",
}));

import { resolveServiceUser, getDefaultServiceUser } from "../../src/utils/service-user.utils";

describe("service-user.utils", () => {
    const originalPlatform = process.platform;

    afterEach(() => {
        Object.defineProperty(process, "platform", { value: originalPlatform });
        vi.restoreAllMocks();
    });

    describe("getDefaultServiceUser()", () => {
        it("should return current username on macOS", () => {
            Object.defineProperty(process, "platform", { value: "darwin" });
            mockUserInfo.mockReturnValue({
                username: "johndoe",
                uid: 501,
                gid: 20,
                shell: "/bin/zsh",
                homedir: "/Users/johndoe",
            });

            expect(getDefaultServiceUser()).toBe("johndoe");
        });

        it("should return 'syncreeper' on Linux", () => {
            Object.defineProperty(process, "platform", { value: "linux" });

            expect(getDefaultServiceUser()).toBe("syncreeper");
        });

        it("should return 'syncreeper' on unknown platforms", () => {
            Object.defineProperty(process, "platform", { value: "win32" });

            expect(getDefaultServiceUser()).toBe("syncreeper");
        });
    });

    describe("resolveServiceUser()", () => {
        it("should return explicit user when provided", async () => {
            const result = await resolveServiceUser("myuser");

            expect(result).toBe("myuser");
            expect(mockExeca).not.toHaveBeenCalled();
        });

        it("should query Pulumi config when no explicit user", async () => {
            mockExeca.mockResolvedValue({
                exitCode: 0,
                stdout: "pulumiuser",
            });

            const result = await resolveServiceUser();

            expect(result).toBe("pulumiuser");
            expect(mockExeca).toHaveBeenCalledWith(
                "pulumi",
                ["config", "get", "syncreeper:service-user"],
                { reject: false }
            );
        });

        it("should fall back to platform default when Pulumi fails", async () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            mockExeca.mockResolvedValue({
                exitCode: 1,
                stdout: "",
            });

            const result = await resolveServiceUser();

            expect(result).toBe("syncreeper");
        });

        it("should fall back to platform default when Pulumi returns empty stdout", async () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            mockExeca.mockResolvedValue({
                exitCode: 0,
                stdout: "   ",
            });

            const result = await resolveServiceUser();

            expect(result).toBe("syncreeper");
        });

        it("should fall back to macOS username when Pulumi throws", async () => {
            Object.defineProperty(process, "platform", { value: "darwin" });
            mockUserInfo.mockReturnValue({
                username: "macuser",
                uid: 501,
                gid: 20,
                shell: "/bin/zsh",
                homedir: "/Users/macuser",
            });
            mockExeca.mockRejectedValue(new Error("command not found"));

            const result = await resolveServiceUser();

            expect(result).toBe("macuser");
        });

        it("should trim whitespace from Pulumi output", async () => {
            mockExeca.mockResolvedValue({
                exitCode: 0,
                stdout: "  pulumi-user  \n",
            });

            const result = await resolveServiceUser();

            expect(result).toBe("pulumi-user");
        });
    });
});
