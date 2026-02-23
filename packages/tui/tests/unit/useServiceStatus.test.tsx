/**
 * Unit tests for useServiceStatus hook
 *
 * Tests the polling, status parsing, and refresh logic.
 * Mocks execa to simulate different command outputs.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

const { mockExeca } = vi.hoisted(() => ({
    mockExeca: vi.fn(),
}));

vi.mock("execa", () => ({
    execa: mockExeca,
}));

import React from "react";
import { render } from "ink-testing-library";
import { useServiceStatus } from "../../src/hooks/useServiceStatus";
import { Text, Box } from "ink";

/** Wait for async effects to settle */
function waitForEffects(ms = 50): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Test harness component that renders the hook output as text.
 */
function StatusHarness({
    command,
    args,
    refreshTrigger,
}: {
    command: string;
    args: string[];
    refreshTrigger: number;
}): React.ReactElement {
    // Use a very long interval so the periodic timer doesn't interfere
    const result = useServiceStatus(command, args, refreshTrigger, 999999);

    return (
        <Box flexDirection="column">
            <Text>status:{result.status}</Text>
            <Text>loading:{result.isLoading.toString()}</Text>
            <Text>output:{result.output.substring(0, 100)}</Text>
        </Box>
    );
}

describe("useServiceStatus", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should parse 'active (running)' as running status", async () => {
        mockExeca.mockResolvedValue({
            exitCode: 0,
            stdout: "syncthing.service - Syncthing\n   Active: active (running) since Mon",
            stderr: "",
        });

        const instance = render(
            <StatusHarness command="systemctl" args={["status", "syncthing"]} refreshTrigger={0} />
        );

        await waitForEffects();
        expect(instance.lastFrame()).toContain("status:running");
        instance.unmount();
    });

    it("should parse 'active (waiting)' as active status", async () => {
        mockExeca.mockResolvedValue({
            exitCode: 0,
            stdout: "timer.service\n   Active: active (waiting)",
            stderr: "",
        });

        const instance = render(
            <StatusHarness command="systemctl" args={["status", "timer"]} refreshTrigger={0} />
        );

        await waitForEffects();
        expect(instance.lastFrame()).toContain("status:active");
        instance.unmount();
    });

    it("should parse exit code 3 as stopped", async () => {
        mockExeca.mockResolvedValue({
            exitCode: 3,
            stdout: "inactive (dead)",
            stderr: "",
        });

        const instance = render(
            <StatusHarness command="systemctl" args={["status", "svc"]} refreshTrigger={0} />
        );

        await waitForEffects();
        expect(instance.lastFrame()).toContain("status:stopped");
        instance.unmount();
    });

    it("should parse exit code 4 as unknown", async () => {
        mockExeca.mockResolvedValue({
            exitCode: 4,
            stdout: "",
            stderr: "Unit not found",
        });

        const instance = render(
            <StatusHarness
                command="systemctl"
                args={["status", "nonexistent"]}
                refreshTrigger={0}
            />
        );

        await waitForEffects();
        expect(instance.lastFrame()).toContain("status:unknown");
        instance.unmount();
    });

    it("should set error status on non-standard exit code", async () => {
        mockExeca.mockResolvedValue({
            exitCode: 1,
            stdout: "",
            stderr: "Access denied",
        });

        const instance = render(
            <StatusHarness command="systemctl" args={["status", "svc"]} refreshTrigger={0} />
        );

        await waitForEffects();
        expect(instance.lastFrame()).toContain("status:error");
        instance.unmount();
    });

    it("should handle command exceptions gracefully", async () => {
        mockExeca.mockRejectedValue(new Error("command not found"));

        const instance = render(
            <StatusHarness command="nonexistent" args={[]} refreshTrigger={0} />
        );

        await waitForEffects();
        expect(instance.lastFrame()).toContain("status:unknown");
        expect(instance.lastFrame()).toContain("Failed to check");
        instance.unmount();
    });

    it("should parse 'active (exited)' as active", async () => {
        mockExeca.mockResolvedValue({
            exitCode: 0,
            stdout: "Active: active (exited)",
            stderr: "",
        });

        const instance = render(
            <StatusHarness command="systemctl" args={["status", "svc"]} refreshTrigger={0} />
        );

        await waitForEffects();
        expect(instance.lastFrame()).toContain("status:active");
        instance.unmount();
    });

    it("should default to running when exit 0 but no recognized status text", async () => {
        mockExeca.mockResolvedValue({
            exitCode: 0,
            stdout: "some unrecognized output",
            stderr: "",
        });

        const instance = render(
            <StatusHarness command="ufw" args={["status"]} refreshTrigger={0} />
        );

        await waitForEffects();
        expect(instance.lastFrame()).toContain("status:running");
        instance.unmount();
    });

    it("should combine stdout and stderr in output", async () => {
        mockExeca.mockResolvedValue({
            exitCode: 0,
            stdout: "Active: active (running)",
            stderr: "Warning: something",
        });

        const instance = render(
            <StatusHarness command="systemctl" args={["status", "svc"]} refreshTrigger={0} />
        );

        await waitForEffects();
        expect(instance.lastFrame()).toContain("Warning: something");
        instance.unmount();
    });
});
