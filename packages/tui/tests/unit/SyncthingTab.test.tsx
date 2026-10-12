import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "ink-testing-library";

const { mockExeca } = vi.hoisted(() => ({ mockExeca: vi.fn() }));

vi.mock("execa", () => ({ execa: mockExeca, execaSync: vi.fn() }));
vi.mock("@syncreeper/shared", () => ({
    isLinux: () => false,
    isMacOS: () => true,
    DEFAULT_SERVICE_USER_LINUX: "syncreeper",
}));

import { SyncthingTab } from "../../src/tabs/SyncthingTab";

describe("SyncthingTab", () => {
    afterEach(() => {
        cleanup();
        vi.resetAllMocks();
    });

    it("should show the API failure and finish loading when Syncthing is stopped", async () => {
        mockExeca.mockImplementation(async (command: string) => ({
            exitCode: 1,
            stdout: "",
            stderr:
                command === "launchctl"
                    ? 'Could not find service "homebrew.mxcl.syncthing" in domain for port'
                    : "syncthing: error: dial tcp 127.0.0.1:8384: connect: connection refused",
        }));
        const instance = render(
            <SyncthingTab
                refreshTrigger={0}
                scrollOffset={0}
                serviceActionTrigger={{ seq: 0, action: "start" }}
                onActionUpdate={vi.fn()}
            />
        );
        await vi.waitFor(() => {
            expect(instance.lastFrame()).toContain("[STOPPED]");
            expect(instance.lastFrame()).toContain("This Device: unavailable");
            expect(instance.lastFrame()).toContain("connection refused");
            expect(instance.lastFrame()).not.toContain("loading...");
        });
    });

    it.each(["start", "stop", "restart"] as const)(
        "should use Homebrew to %s Syncthing and refresh device details",
        async (action) => {
            let serviceRunning = false;
            mockExeca.mockImplementation(async (command: string, commandArguments: string[]) => {
                if (command === "brew") {
                    serviceRunning = action !== "stop";
                    return { exitCode: 0, stdout: "Successfully updated service", stderr: "" };
                }
                if (command === "launchctl") {
                    return serviceRunning
                        ? { exitCode: 0, stdout: '"PID" = 123;', stderr: "" }
                        : { exitCode: 1, stdout: "", stderr: "Could not find service" };
                }
                if (!serviceRunning) {
                    return { exitCode: 1, stdout: "", stderr: "connection refused" };
                }
                return {
                    exitCode: 0,
                    stdout: commandArguments.includes("system")
                        ? '{"myID":"LOCAL-DEVICE-ID"}'
                        : '{"connections":{}}',
                    stderr: "",
                };
            });
            const onActionUpdate = vi.fn();
            const instance = render(
                <SyncthingTab
                    refreshTrigger={0}
                    scrollOffset={0}
                    serviceActionTrigger={{ seq: 0, action }}
                    onActionUpdate={onActionUpdate}
                />
            );
            await vi.waitFor(() => {
                expect(instance.lastFrame()).toContain("This Device: unavailable");
            });
            instance.rerender(
                <SyncthingTab
                    refreshTrigger={0}
                    scrollOffset={0}
                    serviceActionTrigger={{ seq: 1, action }}
                    onActionUpdate={onActionUpdate}
                />
            );
            await vi.waitFor(() => {
                expect(mockExeca).toHaveBeenCalledWith(
                    "brew",
                    ["services", action, "syncthing"],
                    expect.objectContaining({ reject: false })
                );
                expect(onActionUpdate).toHaveBeenCalledWith("success", expect.any(String));
                expect(instance.lastFrame()).toContain(
                    action === "stop" ? "This Device: unavailable" : "LOCAL-DEVICE-ID"
                );
            });
        }
    );
});
