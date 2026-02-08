/**
 * Unit tests for command helper functions
 *
 * Tests the command string generation and Pulumi resource creation
 * for enableServiceLinux, enableUserServiceLinux, enableServiceDarwin,
 * and enableBrewService.
 *
 * Uses pulumi.runtime.setMocks() to intercept resource creation and
 * verify the generated command strings.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// Mock @syncreeper/shared platform detection
vi.mock("@syncreeper/shared", () => ({
    isLinux: () => true,
    isMacOS: () => false,
}));

import * as pulumi from "@pulumi/pulumi";

// Track all resources created during mock execution
interface MockResource {
    name: string;
    type: string;
    inputs: Record<string, unknown>;
}

let createdResources: MockResource[] = [];

// Set up Pulumi mocks BEFORE any Pulumi resource code is imported
beforeAll(() => {
    pulumi.runtime.setMocks(
        {
            newResource(args: pulumi.runtime.MockResourceArgs): {
                id: string;
                state: Record<string, unknown>;
            } {
                createdResources.push({
                    name: args.name,
                    type: args.type,
                    inputs: args.inputs,
                });
                return {
                    id: `${args.name}-id`,
                    state: {
                        ...args.inputs,
                        stdout: "",
                        stderr: "",
                    },
                };
            },
            call(args: pulumi.runtime.MockCallArgs): Record<string, unknown> {
                return args.inputs;
            },
        },
        "syncreeper",
        "test",
        false
    );
});

beforeEach(() => {
    createdResources = [];
});

// ============================================================================
// enableServiceLinux
// ============================================================================

describe("enableServiceLinux", () => {
    it("should create a command:local:Command resource", async () => {
        const { enableServiceLinux } = await import("../../src/lib/command.linux");

        enableServiceLinux({ name: "test-enable", service: "myservice" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-enable");
        expect(resource).toBeDefined();
        expect(resource!.type).toBe("command:local:Command");
    });

    it("should include daemon-reload in create command", async () => {
        const { enableServiceLinux } = await import("../../src/lib/command.linux");

        enableServiceLinux({ name: "test-reload", service: "sshd" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-reload");
        expect(resource!.inputs.create).toContain("systemctl daemon-reload");
    });

    it("should enable and start service by default", async () => {
        const { enableServiceLinux } = await import("../../src/lib/command.linux");

        enableServiceLinux({ name: "test-defaults", service: "nginx" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-defaults");
        const cmd = resource!.inputs.create as string;
        expect(cmd).toContain("systemctl enable nginx");
        expect(cmd).toContain("systemctl start nginx");
    });

    it("should skip enable when enable=false", async () => {
        const { enableServiceLinux } = await import("../../src/lib/command.linux");

        enableServiceLinux({ name: "test-no-enable", service: "nginx", enable: false });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-no-enable");
        const cmd = resource!.inputs.create as string;
        expect(cmd).not.toContain("systemctl enable");
        expect(cmd).toContain("systemctl start nginx");
    });

    it("should skip start when start=false", async () => {
        const { enableServiceLinux } = await import("../../src/lib/command.linux");

        enableServiceLinux({ name: "test-no-start", service: "nginx", start: false });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-no-start");
        const cmd = resource!.inputs.create as string;
        expect(cmd).toContain("systemctl enable nginx");
        expect(cmd).not.toContain("systemctl start");
    });

    it("should include stop and disable in delete command", async () => {
        const { enableServiceLinux } = await import("../../src/lib/command.linux");

        enableServiceLinux({ name: "test-delete", service: "nginx" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-delete");
        const deleteCmd = resource!.inputs.delete as string;
        expect(deleteCmd).toContain("systemctl stop nginx");
        expect(deleteCmd).toContain("systemctl disable nginx");
    });

    it("should chain commands with &&", async () => {
        const { enableServiceLinux } = await import("../../src/lib/command.linux");

        enableServiceLinux({ name: "test-chain", service: "test" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-chain");
        const cmd = resource!.inputs.create as string;
        expect(cmd).toContain("&&");
    });
});

// ============================================================================
// enableUserServiceLinux
// ============================================================================

describe("enableUserServiceLinux", () => {
    it("should use systemctl --user flag", async () => {
        const { enableUserServiceLinux } = await import("../../src/lib/command.linux");

        enableUserServiceLinux({
            name: "test-user-svc",
            service: "sync",
            username: "syncreeper",
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-user-svc");
        const cmd = resource!.inputs.create as string;
        expect(cmd).toContain("systemctl --user");
    });

    it("should use sudo -u with the specified username", async () => {
        const { enableUserServiceLinux } = await import("../../src/lib/command.linux");

        enableUserServiceLinux({
            name: "test-user-sudo",
            service: "sync",
            username: "myuser",
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-user-sudo");
        const cmd = resource!.inputs.create as string;
        expect(cmd).toContain("sudo -u myuser");
    });

    it("should set XDG_RUNTIME_DIR for user session", async () => {
        const { enableUserServiceLinux } = await import("../../src/lib/command.linux");

        enableUserServiceLinux({
            name: "test-user-xdg",
            service: "sync",
            username: "syncreeper",
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-user-xdg");
        const cmd = resource!.inputs.create as string;
        expect(cmd).toContain("XDG_RUNTIME_DIR=/run/user/");
    });

    it("should include daemon-reload, enable, and start by default", async () => {
        const { enableUserServiceLinux } = await import("../../src/lib/command.linux");

        enableUserServiceLinux({
            name: "test-user-all",
            service: "syncreeper-sync",
            username: "syncreeper",
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-user-all");
        const cmd = resource!.inputs.create as string;
        expect(cmd).toContain("systemctl --user daemon-reload");
        expect(cmd).toContain("systemctl --user enable syncreeper-sync");
        expect(cmd).toContain("systemctl --user start syncreeper-sync");
    });
});

// ============================================================================
// enableServiceDarwin
// ============================================================================

describe("enableServiceDarwin", () => {
    it("should create a command:local:Command resource", async () => {
        const { enableServiceDarwin } = await import("../../src/lib/command.darwin");

        enableServiceDarwin({ name: "test-darwin-svc", service: "com.syncreeper.sync" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-darwin-svc");
        expect(resource).toBeDefined();
        expect(resource!.type).toBe("command:local:Command");
    });

    it("should unload first to apply changes cleanly", async () => {
        const { enableServiceDarwin } = await import("../../src/lib/command.darwin");

        enableServiceDarwin({ name: "test-darwin-unload", service: "com.syncreeper.sync" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-darwin-unload");
        const cmd = resource!.inputs.create as string;
        expect(cmd).toContain("launchctl unload");
        expect(cmd).toContain("com.syncreeper.sync.plist");
    });

    it("should load with -w flag to enable", async () => {
        const { enableServiceDarwin } = await import("../../src/lib/command.darwin");

        enableServiceDarwin({ name: "test-darwin-load", service: "com.syncreeper.sync" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-darwin-load");
        const cmd = resource!.inputs.create as string;
        expect(cmd).toContain("launchctl load -w");
    });

    it("should reference ~/Library/LaunchAgents path", async () => {
        const { enableServiceDarwin } = await import("../../src/lib/command.darwin");

        enableServiceDarwin({ name: "test-darwin-path", service: "com.test.service" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-darwin-path");
        const cmd = resource!.inputs.create as string;
        expect(cmd).toContain("~/Library/LaunchAgents/com.test.service.plist");
    });

    it("should include unload in delete command", async () => {
        const { enableServiceDarwin } = await import("../../src/lib/command.darwin");

        enableServiceDarwin({ name: "test-darwin-del", service: "com.test.service" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-darwin-del");
        const deleteCmd = resource!.inputs.delete as string;
        expect(deleteCmd).toContain("launchctl unload");
    });
});

// ============================================================================
// enableBrewService
// ============================================================================

describe("enableBrewService", () => {
    it("should use 'brew services start' by default", async () => {
        const { enableBrewService } = await import("../../src/lib/command.darwin");

        enableBrewService({ name: "test-brew-start", service: "syncthing" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-brew-start");
        const cmd = resource!.inputs.create as string;
        expect(cmd).toContain("brew services start syncthing");
    });

    it("should use 'brew services restart' when restart=true", async () => {
        const { enableBrewService } = await import("../../src/lib/command.darwin");

        enableBrewService({
            name: "test-brew-restart",
            service: "syncthing",
            restart: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-brew-restart");
        const cmd = resource!.inputs.create as string;
        expect(cmd).toContain("brew services restart syncthing");
    });

    it("should not start when start=false and restart=false", async () => {
        const { enableBrewService } = await import("../../src/lib/command.darwin");

        enableBrewService({
            name: "test-brew-nostart",
            service: "syncthing",
            start: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-brew-nostart");
        const cmd = resource!.inputs.create as string;
        expect(cmd).toContain("registered (not started)");
        expect(cmd).not.toContain("brew services start");
        expect(cmd).not.toContain("brew services restart");
    });

    it("should use 'brew services stop' in delete command", async () => {
        const { enableBrewService } = await import("../../src/lib/command.darwin");

        enableBrewService({ name: "test-brew-del", service: "syncthing" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const resource = createdResources.find((r) => r.name === "test-brew-del");
        const deleteCmd = resource!.inputs.delete as string;
        expect(deleteCmd).toContain("brew services stop syncthing");
    });
});
