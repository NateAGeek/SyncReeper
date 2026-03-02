/**
 * Unit tests for stignore.utils.ts
 *
 * Tests the resolveReposPath() and runRegenerateStignore() utilities
 * used by the TUI keyboard shortcut handler.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const { mockExeca } = vi.hoisted(() => ({
    mockExeca: vi.fn(),
}));

const { mockRegenerateStignore } = vi.hoisted(() => ({
    mockRegenerateStignore: vi.fn(),
}));

const { mockHomedir } = vi.hoisted(() => ({
    mockHomedir: vi.fn(() => "/home/testuser"),
}));

vi.mock("execa", () => ({
    execa: mockExeca,
}));

vi.mock("@syncreeper/shared", () => ({
    regenerateStignore: mockRegenerateStignore,
}));

vi.mock("node:os", () => ({
    homedir: mockHomedir,
}));

import { resolveReposPath, runRegenerateStignore } from "../../src/utils/stignore.utils";

describe("stignore.utils", () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        Object.defineProperty(process, "platform", { value: originalPlatform });
        vi.restoreAllMocks();
    });

    describe("resolveReposPath()", () => {
        it("should return path from Pulumi config when available", async () => {
            mockExeca.mockResolvedValue({
                exitCode: 0,
                stdout: "/pulumi/repos",
            });

            const result = await resolveReposPath();

            expect(result).toBe("/pulumi/repos");
            expect(mockExeca).toHaveBeenCalledWith(
                "pulumi",
                ["config", "get", "syncreeper:repos-path"],
                { reject: false }
            );
        });

        it("should trim whitespace from Pulumi config output", async () => {
            mockExeca.mockResolvedValue({
                exitCode: 0,
                stdout: "  /pulumi/repos  \n",
            });

            const result = await resolveReposPath();

            expect(result).toBe("/pulumi/repos");
        });

        it("should fall back to macOS default on darwin", async () => {
            Object.defineProperty(process, "platform", { value: "darwin" });
            mockHomedir.mockReturnValue("/Users/johndoe");
            mockExeca.mockResolvedValue({ exitCode: 1, stdout: "" });

            const result = await resolveReposPath();

            expect(result).toBe("/Users/johndoe/SyncReeper/repos");
        });

        it("should fall back to /srv/repos on Linux", async () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            mockExeca.mockResolvedValue({ exitCode: 1, stdout: "" });

            const result = await resolveReposPath();

            expect(result).toBe("/srv/repos");
        });

        it("should fall back to platform default when Pulumi throws", async () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            mockExeca.mockRejectedValue(new Error("command not found"));

            const result = await resolveReposPath();

            expect(result).toBe("/srv/repos");
        });

        it("should fall back when Pulumi returns empty stdout", async () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            mockExeca.mockResolvedValue({ exitCode: 0, stdout: "   " });

            const result = await resolveReposPath();

            expect(result).toBe("/srv/repos");
        });
    });

    describe("runRegenerateStignore()", () => {
        it("should call regenerateStignore from shared with the given path", () => {
            mockRegenerateStignore.mockImplementation(() => {});

            runRegenerateStignore("/my/repos");

            expect(mockRegenerateStignore).toHaveBeenCalledWith("/my/repos");
        });

        it("should propagate errors from regenerateStignore", () => {
            mockRegenerateStignore.mockImplementation(() => {
                throw new Error("Write failed");
            });

            expect(() => runRegenerateStignore("/my/repos")).toThrow("Write failed");
        });
    });
});
