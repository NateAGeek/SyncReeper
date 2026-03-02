/**
 * Unit tests for the regenerate-stignore CLI command
 *
 * Tests the resolveReposPath() logic (explicit flag, Pulumi config fallback,
 * platform default) and the command handler behavior (success, missing dir,
 * regeneration failure).
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const { mockExeca } = vi.hoisted(() => ({
    mockExeca: vi.fn(),
}));

const { mockExistsSync } = vi.hoisted(() => ({
    mockExistsSync: vi.fn(),
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

vi.mock("node:fs", () => ({
    existsSync: mockExistsSync,
}));

vi.mock("@syncreeper/shared", () => ({
    regenerateStignore: mockRegenerateStignore,
}));

vi.mock("node:os", () => ({
    homedir: mockHomedir,
}));

import { regenerateStignoreCommand } from "../../src/commands/regenerate-stignore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = regenerateStignoreCommand.handler as (argv: Record<string, any>) => Promise<void>;

describe("regenerate-stignore command", () => {
    const originalPlatform = process.platform;
    let mockExit: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        // Prevent process.exit from actually exiting
        mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        Object.defineProperty(process, "platform", { value: originalPlatform });
        vi.restoreAllMocks();
    });

    describe("command metadata", () => {
        it("should have the correct command name", () => {
            expect(regenerateStignoreCommand.command).toBe("regenerate-stignore");
        });

        it("should have a description", () => {
            expect(regenerateStignoreCommand.describe).toBeTruthy();
        });
    });

    describe("handler with explicit --repos-path", () => {
        it("should use the explicit repos path when provided", async () => {
            mockExistsSync.mockReturnValue(true);
            mockRegenerateStignore.mockImplementation(() => {});

            await handler({
                "repos-path": "/custom/repos",
            });

            expect(mockRegenerateStignore).toHaveBeenCalledWith("/custom/repos");
            expect(mockExeca).not.toHaveBeenCalled();
        });
    });

    describe("handler with Pulumi config fallback", () => {
        it("should query Pulumi config when no explicit path is given", async () => {
            mockExeca.mockResolvedValue({
                exitCode: 0,
                stdout: "/pulumi/repos",
            });
            mockExistsSync.mockReturnValue(true);
            mockRegenerateStignore.mockImplementation(() => {});

            await handler({});

            expect(mockExeca).toHaveBeenCalledWith(
                "pulumi",
                ["config", "get", "syncreeper:repos-path"],
                { reject: false }
            );
            expect(mockRegenerateStignore).toHaveBeenCalledWith("/pulumi/repos");
        });

        it("should trim whitespace from Pulumi config output", async () => {
            mockExeca.mockResolvedValue({
                exitCode: 0,
                stdout: "  /pulumi/repos  \n",
            });
            mockExistsSync.mockReturnValue(true);
            mockRegenerateStignore.mockImplementation(() => {});

            await handler({});

            expect(mockRegenerateStignore).toHaveBeenCalledWith("/pulumi/repos");
        });
    });

    describe("handler with platform default fallback", () => {
        it("should use macOS default when Pulumi fails on darwin", async () => {
            Object.defineProperty(process, "platform", { value: "darwin" });
            mockHomedir.mockReturnValue("/Users/testuser");
            mockExeca.mockResolvedValue({ exitCode: 1, stdout: "" });
            mockExistsSync.mockReturnValue(true);
            mockRegenerateStignore.mockImplementation(() => {});

            await handler({});

            expect(mockRegenerateStignore).toHaveBeenCalledWith("/Users/testuser/SyncReeper/repos");
        });

        it("should use Linux default (/srv/repos) on Linux", async () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            mockExeca.mockResolvedValue({ exitCode: 1, stdout: "" });
            mockExistsSync.mockReturnValue(true);
            mockRegenerateStignore.mockImplementation(() => {});

            await handler({});

            expect(mockRegenerateStignore).toHaveBeenCalledWith("/srv/repos");
        });

        it("should use Linux default when Pulumi throws", async () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            mockExeca.mockRejectedValue(new Error("command not found"));
            mockExistsSync.mockReturnValue(true);
            mockRegenerateStignore.mockImplementation(() => {});

            await handler({});

            expect(mockRegenerateStignore).toHaveBeenCalledWith("/srv/repos");
        });

        it("should use Linux default when Pulumi returns empty stdout", async () => {
            Object.defineProperty(process, "platform", { value: "linux" });
            mockExeca.mockResolvedValue({ exitCode: 0, stdout: "   " });
            mockExistsSync.mockReturnValue(true);
            mockRegenerateStignore.mockImplementation(() => {});

            await handler({});

            expect(mockRegenerateStignore).toHaveBeenCalledWith("/srv/repos");
        });
    });

    describe("handler error cases", () => {
        it("should exit with code 1 if repos directory does not exist", async () => {
            mockExistsSync.mockReturnValue(false);
            mockExeca.mockResolvedValue({ exitCode: 1, stdout: "" });
            Object.defineProperty(process, "platform", { value: "linux" });

            await handler({});

            expect(mockExit).toHaveBeenCalledWith(1);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("does not exist"));
        });

        it("should exit with code 1 if regenerateStignore throws", async () => {
            mockExistsSync.mockReturnValue(true);
            mockExeca.mockResolvedValue({ exitCode: 1, stdout: "" });
            Object.defineProperty(process, "platform", { value: "linux" });
            mockRegenerateStignore.mockImplementation(() => {
                throw new Error("Write failed");
            });

            await handler({});

            expect(mockExit).toHaveBeenCalledWith(1);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("Failed to regenerate")
            );
        });

        it("should include error message in output when regeneration fails", async () => {
            mockExistsSync.mockReturnValue(true);
            mockExeca.mockResolvedValue({ exitCode: 1, stdout: "" });
            Object.defineProperty(process, "platform", { value: "linux" });
            mockRegenerateStignore.mockImplementation(() => {
                throw new Error("EACCES: permission denied");
            });

            await handler({});

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("EACCES: permission denied")
            );
        });
    });

    describe("handler success output", () => {
        it("should log success message after regeneration", async () => {
            mockExistsSync.mockReturnValue(true);
            mockExeca.mockResolvedValue({ exitCode: 1, stdout: "" });
            Object.defineProperty(process, "platform", { value: "linux" });
            mockRegenerateStignore.mockImplementation(() => {});

            await handler({});

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining("regenerated successfully")
            );
            expect(mockExit).not.toHaveBeenCalled();
        });

        it("should log the repos path being used", async () => {
            mockExistsSync.mockReturnValue(true);
            mockRegenerateStignore.mockImplementation(() => {});

            await handler({
                "repos-path": "/my/repos",
            });

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining("/my/repos"));
        });
    });
});
