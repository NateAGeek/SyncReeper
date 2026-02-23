/**
 * Unit tests for TUI components
 *
 * Tests the pure presentation components: StatusBadge, TabBar,
 * LogViewer, KeyHints, ActionBar.
 *
 * Uses ink-testing-library to render Ink components and assert
 * on the text output.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";

import { StatusBadge } from "../../src/components/StatusBadge";
import { TabBar } from "../../src/components/TabBar";
import { LogViewer } from "../../src/components/LogViewer";
import { KeyHints } from "../../src/components/KeyHints";
import { ActionBar } from "../../src/components/ActionBar";

describe("StatusBadge", () => {
    it("should display [RUNNING] for running status", () => {
        const { lastFrame } = render(<StatusBadge status="running" />);
        expect(lastFrame()).toContain("[RUNNING]");
    });

    it("should display [ACTIVE] for active status", () => {
        const { lastFrame } = render(<StatusBadge status="active" />);
        expect(lastFrame()).toContain("[ACTIVE]");
    });

    it("should display [STOPPED] for stopped status", () => {
        const { lastFrame } = render(<StatusBadge status="stopped" />);
        expect(lastFrame()).toContain("[STOPPED]");
    });

    it("should display [ERROR] for error status", () => {
        const { lastFrame } = render(<StatusBadge status="error" />);
        expect(lastFrame()).toContain("[ERROR]");
    });

    it("should display [ENABLED] for enabled status", () => {
        const { lastFrame } = render(<StatusBadge status="enabled" />);
        expect(lastFrame()).toContain("[ENABLED]");
    });

    it("should display [DISABLED] for disabled status", () => {
        const { lastFrame } = render(<StatusBadge status="disabled" />);
        expect(lastFrame()).toContain("[DISABLED]");
    });

    it("should display [UNKNOWN] for unknown status", () => {
        const { lastFrame } = render(<StatusBadge status="unknown" />);
        expect(lastFrame()).toContain("[UNKNOWN]");
    });
});

describe("TabBar", () => {
    const tabs = [
        { label: "Overview", key: "overview" },
        { label: "GitHub Sync", key: "github-sync" },
        { label: "Syncthing", key: "syncthing" },
    ];

    it("should render all tab labels", () => {
        const { lastFrame } = render(<TabBar tabs={tabs} activeIndex={0} />);
        const output = lastFrame()!;
        expect(output).toContain("Overview");
        expect(output).toContain("GitHub Sync");
        expect(output).toContain("Syncthing");
    });

    it("should render with different active indexes without crashing", () => {
        for (let i = 0; i < tabs.length; i++) {
            const { lastFrame } = render(<TabBar tabs={tabs} activeIndex={i} />);
            expect(lastFrame()).toBeDefined();
        }
    });

    it("should render empty tab list", () => {
        const { lastFrame } = render(<TabBar tabs={[]} activeIndex={0} />);
        expect(lastFrame()).toBeDefined();
    });
});

describe("LogViewer", () => {
    it("should display title and line count", () => {
        const lines = ["line 1", "line 2", "line 3"];
        const { lastFrame } = render(
            <LogViewer lines={lines} scrollOffset={0} title="Test Logs" />
        );
        const output = lastFrame()!;
        expect(output).toContain("Test Logs");
        expect(output).toContain("3 lines");
    });

    it("should show 'No log entries found' when empty", () => {
        const { lastFrame } = render(<LogViewer lines={[]} scrollOffset={0} title="Empty" />);
        expect(lastFrame()).toContain("No log entries found");
    });

    it("should show Loading... when isLoading is true", () => {
        const { lastFrame } = render(
            <LogViewer lines={[]} scrollOffset={0} title="Logs" isLoading />
        );
        expect(lastFrame()).toContain("Loading...");
    });

    it("should show visible lines from scrollOffset", () => {
        const lines = Array.from({ length: 30 }, (_, i) => `log entry ${i + 1}`);
        const { lastFrame } = render(
            <LogViewer lines={lines} scrollOffset={5} maxVisible={5} title="Scroll Test" />
        );
        const output = lastFrame()!;
        expect(output).toContain("log entry 6");
        expect(output).toContain("log entry 10");
    });

    it("should clamp scrollOffset to maxOffset", () => {
        const lines = ["only line"];
        const { lastFrame } = render(
            <LogViewer lines={lines} scrollOffset={100} maxVisible={20} title="Clamp" />
        );
        const output = lastFrame()!;
        expect(output).toContain("only line");
    });

    it("should show 'lines above' indicator when scrolled", () => {
        const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
        const { lastFrame } = render(
            <LogViewer lines={lines} scrollOffset={10} maxVisible={5} title="Above" />
        );
        expect(lastFrame()).toContain("lines above");
    });

    it("should show 'lines below' indicator when more content exists", () => {
        const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
        const { lastFrame } = render(
            <LogViewer lines={lines} scrollOffset={0} maxVisible={5} title="Below" />
        );
        expect(lastFrame()).toContain("lines below");
    });
});

describe("KeyHints", () => {
    it("should display key bindings", () => {
        const { lastFrame } = render(<KeyHints />);
        const output = lastFrame()!;
        expect(output).toContain("Tab");
        expect(output).toContain("scroll");
        expect(output).toContain("refresh");
        expect(output).toContain("quit");
        expect(output).toContain("start");
        expect(output).toContain("stop");
        expect(output).toContain("restart");
    });
});

describe("ActionBar", () => {
    it("should return null when idle", () => {
        const { lastFrame } = render(<ActionBar actionStatus="idle" message="" />);
        expect(lastFrame()).toBe("");
    });

    it("should return null when idle with message", () => {
        const { lastFrame } = render(<ActionBar actionStatus="idle" message="stale message" />);
        expect(lastFrame()).toBe("");
    });

    it("should show [...] prefix when running", () => {
        const { lastFrame } = render(
            <ActionBar actionStatus="running" message="starting syncthing..." />
        );
        const output = lastFrame()!;
        expect(output).toContain("[...]");
        expect(output).toContain("starting syncthing...");
    });

    it("should show [OK] prefix on success", () => {
        const { lastFrame } = render(
            <ActionBar actionStatus="success" message="syncthing: restart succeeded" />
        );
        const output = lastFrame()!;
        expect(output).toContain("[OK]");
        expect(output).toContain("syncthing: restart succeeded");
    });

    it("should show [ERR] prefix on error", () => {
        const { lastFrame } = render(
            <ActionBar actionStatus="error" message="syncthing: start failed" />
        );
        const output = lastFrame()!;
        expect(output).toContain("[ERR]");
        expect(output).toContain("syncthing: start failed");
    });

    it("should return null when message is empty even on non-idle status", () => {
        const { lastFrame } = render(<ActionBar actionStatus="running" message="" />);
        expect(lastFrame()).toBe("");
    });
});
