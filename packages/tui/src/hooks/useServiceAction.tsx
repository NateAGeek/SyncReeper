import { useState, useCallback } from "react";
import { execa } from "execa";
import { isLinux, isMacOS } from "@syncreeper/shared";
import { asServiceUser } from "../utils/userCommand.utils.js";

export type ServiceAction = "start" | "stop" | "restart";

export type ActionStatus = "idle" | "running" | "success" | "error";

export interface ServiceActionResult {
    actionStatus: ActionStatus;
    message: string;
    run: (action: ServiceAction) => void;
}

export interface ServiceActionOptions {
    /** The systemd unit name (e.g. "syncthing", "syncreeper-sync.timer") */
    unit: string;
    /** Whether this is a user-level service (--user) or system-level (requires sudo) */
    userLevel: boolean;
    /** macOS launchctl label (e.g. "syncthing", "com.syncreeper.sync") */
    launchctlLabel?: string;
    /** Callback fired after a successful action (e.g. to refresh status) */
    onSuccess?: () => void;
}

/**
 * Hook to start/stop/restart a systemd or launchctl service.
 *
 * - Linux user services:   systemctl --user <action> <unit>
 *   (when root, wraps via asServiceUser to target the syncreeper user's session)
 * - Linux system services: sudo systemctl <action> <unit>
 * - macOS services:        launchctl kickstart/kill -k <domain>/<label>
 */
export function useServiceAction(options: ServiceActionOptions): ServiceActionResult {
    const { unit, userLevel, launchctlLabel, onSuccess } = options;
    const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
    const [message, setMessage] = useState("");

    const run = useCallback(
        (action: ServiceAction) => {
            // Prevent concurrent actions
            if (actionStatus === "running") return;

            setActionStatus("running");
            setMessage(`${action}ing ${unit}...`);

            (async () => {
                try {
                    if (isLinux()) {
                        let command: string;
                        let fullArgs: string[];

                        if (userLevel) {
                            // Use asServiceUser so it works correctly when root
                            const wrapped = asServiceUser("systemctl", ["--user", action, unit]);
                            command = wrapped.command;
                            fullArgs = wrapped.args;
                        } else {
                            // System-level: use sudo directly
                            command = "sudo";
                            fullArgs = ["systemctl", action, unit];
                        }

                        const result = await execa(command, fullArgs, {
                            reject: false,
                            timeout: 30000,
                        });

                        if (result.exitCode === 0) {
                            setActionStatus("success");
                            setMessage(`${unit}: ${action} succeeded`);
                            onSuccess?.();
                        } else {
                            setActionStatus("error");
                            const err =
                                result.stderr?.trim() || result.stdout?.trim() || "unknown error";
                            setMessage(`${unit}: ${action} failed — ${err}`);
                        }
                    } else if (isMacOS()) {
                        const label = launchctlLabel ?? unit;
                        const domain = userLevel ? `gui/${process.getuid?.() ?? 501}` : "system";
                        const target = `${domain}/${label}`;

                        let result;
                        if (action === "stop") {
                            result = await execa("launchctl", ["kill", "SIGTERM", target], {
                                reject: false,
                                timeout: 15000,
                            });
                        } else if (action === "start") {
                            result = await execa("launchctl", ["kickstart", target], {
                                reject: false,
                                timeout: 15000,
                            });
                        } else {
                            // restart = kickstart -k (kill + start)
                            result = await execa("launchctl", ["kickstart", "-k", target], {
                                reject: false,
                                timeout: 15000,
                            });
                        }

                        if (result.exitCode === 0) {
                            setActionStatus("success");
                            setMessage(`${label}: ${action} succeeded`);
                            onSuccess?.();
                        } else {
                            setActionStatus("error");
                            const err =
                                result.stderr?.trim() || result.stdout?.trim() || "unknown error";
                            setMessage(`${label}: ${action} failed — ${err}`);
                        }
                    } else {
                        setActionStatus("error");
                        setMessage("Service actions not supported on this platform");
                    }
                } catch (err) {
                    setActionStatus("error");
                    const msg = err instanceof Error ? err.message : "unexpected error";
                    setMessage(`${unit}: ${action} failed — ${msg}`);
                }

                // Auto-clear status after a few seconds
                setTimeout(() => {
                    setActionStatus("idle");
                    setMessage("");
                }, 4000);
            })();
        },
        [unit, userLevel, launchctlLabel, onSuccess, actionStatus]
    );

    return { actionStatus, message, run };
}
