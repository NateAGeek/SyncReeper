/**
 * Unit tests for platform-specific path configuration
 *
 * Tests the pure configuration functions in paths.linux.ts and paths.darwin.ts.
 * Darwin functions use os.homedir()/os.userInfo() which are mocked.
 */

import { describe, it, expect, vi } from "vitest";

// ============================================================================
// Mock node:os for Darwin path tests (must be hoisted)
// ============================================================================
const { mockUserInfo, mockHomedir } = vi.hoisted(() => ({
    mockUserInfo: vi.fn(() => ({
        username: "darwinuser",
        uid: 501,
        gid: 20,
        shell: "/bin/zsh",
        homedir: "/Users/darwinuser",
    })),
    mockHomedir: vi.fn(() => "/Users/darwinuser"),
}));

vi.mock("node:os", () => ({
    userInfo: mockUserInfo,
    homedir: mockHomedir,
    default: { userInfo: mockUserInfo, homedir: mockHomedir },
}));

import {
    DEFAULT_SERVICE_USER_LINUX,
    getServiceUserLinux,
    getPathsLinux,
    getDefaultConfigLinux,
} from "../../src/config/paths.linux";

import {
    getServiceUserDarwin,
    getPathsDarwin,
    getDefaultConfigDarwin,
} from "../../src/config/paths.darwin";

// ============================================================================
// Linux Path Configuration
// ============================================================================

describe("Linux Path Configuration", () => {
    describe("DEFAULT_SERVICE_USER_LINUX", () => {
        it("should be 'syncreeper'", () => {
            expect(DEFAULT_SERVICE_USER_LINUX).toBe("syncreeper");
        });
    });

    describe("getServiceUserLinux", () => {
        it("should return default username 'syncreeper'", () => {
            const user = getServiceUserLinux();
            expect(user.name).toBe("syncreeper");
        });

        it("should return home directory under /home", () => {
            const user = getServiceUserLinux();
            expect(user.home).toBe("/home/syncreeper");
        });

        it("should use /bin/bash shell", () => {
            const user = getServiceUserLinux();
            expect(user.shell).toBe("/bin/bash");
        });

        it("should use custom username when provided", () => {
            const user = getServiceUserLinux("myuser");
            expect(user.name).toBe("myuser");
            expect(user.home).toBe("/home/myuser");
        });
    });

    describe("getPathsLinux", () => {
        it("should derive syncApp from home directory", () => {
            const paths = getPathsLinux();
            expect(paths.syncApp).toBe("/home/syncreeper/.config/syncreeper/sync");
        });

        it("should have syncScript at /usr/local/bin/sync-repos", () => {
            const paths = getPathsLinux();
            expect(paths.syncScript).toBe("/usr/local/bin/sync-repos");
        });

        it("should derive syncthingConfig from home directory", () => {
            const paths = getPathsLinux();
            expect(paths.syncthingConfig).toBe("/home/syncreeper/.config/syncthing");
        });

        it("should use /var/log/syncreeper for logs", () => {
            const paths = getPathsLinux();
            expect(paths.logDir).toBe("/var/log/syncreeper");
        });

        it("should use /etc/syncreeper for env/secrets", () => {
            const paths = getPathsLinux();
            expect(paths.envDir).toBe("/etc/syncreeper");
        });

        it("should derive userSystemd from home directory", () => {
            const paths = getPathsLinux();
            expect(paths.userSystemd).toBe("/home/syncreeper/.config/systemd/user");
        });

        it("should have empty launchAgents on Linux", () => {
            const paths = getPathsLinux();
            expect(paths.launchAgents).toBe("");
        });

        it("should use custom username for path derivation", () => {
            const paths = getPathsLinux("myuser");
            expect(paths.syncApp).toBe("/home/myuser/.config/syncreeper/sync");
            expect(paths.syncthingConfig).toBe("/home/myuser/.config/syncthing");
            expect(paths.userSystemd).toBe("/home/myuser/.config/systemd/user");
        });

        it("should keep fixed paths unchanged with custom username", () => {
            const paths = getPathsLinux("myuser");
            expect(paths.syncScript).toBe("/usr/local/bin/sync-repos");
            expect(paths.logDir).toBe("/var/log/syncreeper");
            expect(paths.envDir).toBe("/etc/syncreeper");
        });
    });

    describe("getDefaultConfigLinux", () => {
        it("should default to daily schedule", () => {
            const config = getDefaultConfigLinux();
            expect(config.schedule).toBe("daily");
        });

        it("should default repos path to /srv/repos", () => {
            const config = getDefaultConfigLinux();
            expect(config.reposPath).toBe("/srv/repos");
        });

        it("should default folder ID to 'repos'", () => {
            const config = getDefaultConfigLinux();
            expect(config.syncthingFolderId).toBe("repos");
        });
    });
});

// ============================================================================
// Darwin (macOS) Path Configuration
// ============================================================================

describe("Darwin Path Configuration", () => {
    describe("getServiceUserDarwin", () => {
        it("should default to the current OS username", () => {
            const user = getServiceUserDarwin();
            expect(user.name).toBe("darwinuser");
        });

        it("should use os.homedir() for the home directory", () => {
            const user = getServiceUserDarwin();
            expect(user.home).toBe("/Users/darwinuser");
        });

        it("should use /bin/zsh shell", () => {
            const user = getServiceUserDarwin();
            expect(user.shell).toBe("/bin/zsh");
        });

        it("should use custom username and derive /Users path when provided", () => {
            const user = getServiceUserDarwin("testuser");
            expect(user.name).toBe("testuser");
            expect(user.home).toBe("/Users/testuser");
        });
    });

    describe("getPathsDarwin", () => {
        it("should place syncApp under Library/Application Support", () => {
            const paths = getPathsDarwin();
            expect(paths.syncApp).toContain("Library");
            expect(paths.syncApp).toContain("Application Support");
            expect(paths.syncApp).toContain("SyncReeper");
        });

        it("should place syncScript in .local/bin", () => {
            const paths = getPathsDarwin();
            expect(paths.syncScript).toContain(".local");
            expect(paths.syncScript).toContain("sync-repos");
        });

        it("should place syncthingConfig under Library/Application Support/Syncthing", () => {
            const paths = getPathsDarwin();
            expect(paths.syncthingConfig).toContain("Library");
            expect(paths.syncthingConfig).toContain("Syncthing");
        });

        it("should place logDir under Library/Logs/SyncReeper", () => {
            const paths = getPathsDarwin();
            expect(paths.logDir).toContain("Library");
            expect(paths.logDir).toContain("Logs");
            expect(paths.logDir).toContain("SyncReeper");
        });

        it("should place envDir under Library/Application Support/SyncReeper/config", () => {
            const paths = getPathsDarwin();
            expect(paths.envDir).toContain("SyncReeper");
            expect(paths.envDir).toContain("config");
        });

        it("should have empty userSystemd on macOS", () => {
            const paths = getPathsDarwin();
            expect(paths.userSystemd).toBe("");
        });

        it("should place launchAgents under Library/LaunchAgents", () => {
            const paths = getPathsDarwin();
            expect(paths.launchAgents).toContain("Library");
            expect(paths.launchAgents).toContain("LaunchAgents");
        });

        it("should use custom username for all path derivations", () => {
            const paths = getPathsDarwin("testuser");
            expect(paths.syncApp).toContain("testuser");
            expect(paths.syncScript).toContain("testuser");
            expect(paths.logDir).toContain("testuser");
            expect(paths.launchAgents).toContain("testuser");
        });
    });

    describe("getDefaultConfigDarwin", () => {
        it("should default to daily schedule", () => {
            const config = getDefaultConfigDarwin();
            expect(config.schedule).toBe("daily");
        });

        it("should derive repos path from home directory", () => {
            const config = getDefaultConfigDarwin();
            expect(config.reposPath).toContain("SyncReeper");
            expect(config.reposPath).toContain("repos");
        });

        it("should default folder ID to 'repos'", () => {
            const config = getDefaultConfigDarwin();
            expect(config.syncthingFolderId).toBe("repos");
        });

        it("should use custom username for repos path derivation", () => {
            const config = getDefaultConfigDarwin("testuser");
            expect(config.reposPath).toContain("testuser");
        });
    });
});
