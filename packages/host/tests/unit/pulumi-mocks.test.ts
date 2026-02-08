/**
 * Pulumi mock tests for resource creation verification
 *
 * Uses pulumi.runtime.setMocks() to verify that setup functions
 * create the expected Pulumi resources without actually executing commands.
 *
 * These tests verify the "wiring" — that the right resources are created
 * with the right dependencies, rather than testing command content
 * (which is covered by the pure function unit tests).
 *
 * Platform is mocked to Linux since most setup functions are Linux-oriented
 * and we're running tests on Windows.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

// Mock @syncreeper/shared to simulate Linux platform
// This is hoisted by vitest, so it applies before any imports
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
    createdResources = [];

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
        "syncreeper", // project
        "test", // stack
        false // preview
    );
});

describe("Pulumi Mock Tests - SSH Setup", () => {
    it("should create expected resources for SSH hardening", async () => {
        createdResources = [];

        // Dynamic import after mocks are set
        const { setupSSH } = await import("../../src/services/ssh/index");
        const { setConfiguredUsername } = await import("../../src/config/types");

        // Set the configured username so getServiceUser() works
        setConfiguredUsername("syncreeper");

        const result = setupSSH({
            authorizedKeys: ["ssh-ed25519 AAAA... test@host"],
        });

        // Give Pulumi a tick to register resources
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should create multiple resources
        expect(result.resources.length).toBeGreaterThan(0);

        // Find resource names
        const resourceNames = createdResources.map((r) => r.name);

        // Should have the sshd config, ssh directory, authorized keys,
        // config validation, sshd restart, and verification
        expect(resourceNames).toContain("sshd-hardening-config");
        expect(resourceNames).toContain("ssh-dir-syncreeper");
        expect(resourceNames).toContain("ssh-authorized-keys-syncreeper");
        expect(resourceNames).toContain("ssh-validate-config");
        expect(resourceNames).toContain("ssh-restart-sshd");
        expect(resourceNames).toContain("ssh-verify");
    });

    it("should throw if no authorized keys provided", async () => {
        const { setupSSH } = await import("../../src/services/ssh/index");

        expect(() => setupSSH({ authorizedKeys: [] })).toThrow(
            "SSH hardening requires at least one authorized key"
        );
    });

    it("should create all resources as command:local:Command", async () => {
        createdResources = [];

        const { setupSSH } = await import("../../src/services/ssh/index");
        const { setConfiguredUsername } = await import("../../src/config/types");
        setConfiguredUsername("syncreeper");

        setupSSH({
            authorizedKeys: ["ssh-ed25519 AAAA... test@host"],
        });

        // Give Pulumi a tick to register resources
        await new Promise((resolve) => setTimeout(resolve, 100));

        // All resources should be local commands
        for (const resource of createdResources) {
            expect(resource.type).toBe("command:local:Command");
        }
    });
});

describe("Pulumi Mock Tests - Firewall Setup", () => {
    it("should create resources for Linux UFW firewall", async () => {
        createdResources = [];

        const { setupFirewallLinux } = await import("../../src/services/firewall/linux");

        const result = setupFirewallLinux();

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(result.resources.length).toBe(2);

        const resourceNames = createdResources.map((r) => r.name);
        expect(resourceNames).toContain("configure-ufw");
        expect(resourceNames).toContain("verify-ufw");
    });

    it("should create resources for macOS pf firewall", async () => {
        createdResources = [];

        const { setupFirewallDarwin } = await import("../../src/services/firewall/darwin");

        const result = setupFirewallDarwin();

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(result.resources.length).toBe(3);

        const resourceNames = createdResources.map((r) => r.name);
        expect(resourceNames).toContain("write-pf-anchor");
        expect(resourceNames).toContain("load-pf-anchor");
        expect(resourceNames).toContain("verify-pf");
    });
});

describe("Pulumi Mock Tests - Auto Updates Setup", () => {
    it("should create resources for Linux auto-updates", async () => {
        createdResources = [];

        const { setupAutoUpdatesLinux } = await import("../../src/services/auto-updates/linux");

        const result = setupAutoUpdatesLinux();

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(result.resources.length).toBe(4);

        const resourceNames = createdResources.map((r) => r.name);
        expect(resourceNames).toContain("unattended-upgrades-config");
        expect(resourceNames).toContain("auto-upgrades-config");
        expect(resourceNames).toContain("enable-unattended-upgrades");
        expect(resourceNames).toContain("verify-auto-updates");
    });
});

describe("Pulumi Mock Tests - SSHGuard Setup", () => {
    it("should create resources for Linux SSHGuard", async () => {
        createdResources = [];

        const { setupSSHGuardLinux } = await import("../../src/services/sshguard/linux");

        const result = setupSSHGuardLinux();

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(result.resources.length).toBe(3);

        const resourceNames = createdResources.map((r) => r.name);
        expect(resourceNames).toContain("sshguard-whitelist");
        expect(resourceNames).toContain("enable-sshguard");
        expect(resourceNames).toContain("verify-sshguard");
    });

    it("should create resources for macOS SSHGuard", async () => {
        createdResources = [];

        const { setupSSHGuardDarwin } = await import("../../src/services/sshguard/darwin");

        const result = setupSSHGuardDarwin();

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(result.resources.length).toBe(4);

        const resourceNames = createdResources.map((r) => r.name);
        expect(resourceNames).toContain("sshguard-whitelist");
        expect(resourceNames).toContain("configure-sshguard-pf");
        expect(resourceNames).toContain("enable-sshguard");
        expect(resourceNames).toContain("verify-sshguard");
    });
});
