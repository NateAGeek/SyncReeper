/**
 * Unit tests for useLogs hook
 *
 * Tests log fetching, line splitting, and truncation behavior.
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
import { useLogs } from "../../src/hooks/useLogs";
import { Text, Box } from "ink";

/** Wait for async effects to settle */
function waitForEffects(ms = 50): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function LogsHarness({
    command,
    args,
    refreshTrigger,
    maxLines,
}: {
    command: string;
    args: string[];
    refreshTrigger: number;
    maxLines?: number;
}): React.ReactElement {
    const result = useLogs(command, args, refreshTrigger, maxLines);

    return (
        <Box flexDirection="column">
            <Text>count:{result.lines.length}</Text>
            <Text>loading:{result.isLoading.toString()}</Text>
            {result.lines.map((line, i) => (
                <Text key={i}>line:{line}</Text>
            ))}
        </Box>
    );
}

describe("useLogs", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should fetch and split log lines", async () => {
        mockExeca.mockResolvedValue({
            exitCode: 0,
            stdout: "line one\nline two\nline three",
            stderr: "",
        });

        const instance = render(
            <LogsHarness command="journalctl" args={["-n", "100"]} refreshTrigger={0} />
        );

        await waitForEffects();

        const output = instance.lastFrame()!;
        expect(output).toContain("count:3");
        expect(output).toContain("line:line one");
        expect(output).toContain("line:line two");
        expect(output).toContain("line:line three");
        instance.unmount();
    });

    it("should truncate to maxLines from the end", async () => {
        const lines = Array.from({ length: 50 }, (_, i) => `entry ${i + 1}`);
        mockExeca.mockResolvedValue({
            exitCode: 0,
            stdout: lines.join("\n"),
            stderr: "",
        });

        const instance = render(
            <LogsHarness
                command="journalctl"
                args={["-n", "100"]}
                refreshTrigger={0}
                maxLines={10}
            />
        );

        await waitForEffects();

        const output = instance.lastFrame()!;
        expect(output).toContain("count:10");
        expect(output).toContain("line:entry 41");
        expect(output).toContain("line:entry 50");
        expect(output).not.toContain("line:entry 40");
        instance.unmount();
    });

    it("should handle empty output", async () => {
        mockExeca.mockResolvedValue({
            exitCode: 0,
            stdout: "",
            stderr: "",
        });

        const instance = render(<LogsHarness command="journalctl" args={[]} refreshTrigger={0} />);

        await waitForEffects();
        expect(instance.lastFrame()).toContain("count:0");
        instance.unmount();
    });

    it("should handle command failure gracefully", async () => {
        mockExeca.mockRejectedValue(new Error("command failed"));

        const instance = render(<LogsHarness command="nonexistent" args={[]} refreshTrigger={0} />);

        await waitForEffects();

        const output = instance.lastFrame()!;
        expect(output).toContain("count:1");
        expect(output).toContain("Failed to fetch logs");
        instance.unmount();
    });

    it("should handle whitespace-only output as empty", async () => {
        mockExeca.mockResolvedValue({
            exitCode: 0,
            stdout: "   \n  ",
            stderr: "",
        });

        const instance = render(<LogsHarness command="journalctl" args={[]} refreshTrigger={0} />);

        await waitForEffects();
        expect(instance.lastFrame()).toContain("count:0");
        instance.unmount();
    });
});
