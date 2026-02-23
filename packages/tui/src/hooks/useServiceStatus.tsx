import { useState, useEffect, useCallback } from "react";
import { execa } from "execa";

export type ServiceStatusValue = "running" | "active" | "stopped" | "error" | "unknown";

export interface ServiceStatusResult {
    status: ServiceStatusValue;
    output: string;
    lastChecked: Date | null;
    isLoading: boolean;
    refresh: () => void;
}

/**
 * Poll a system command periodically and parse its output to determine service status.
 */
export function useServiceStatus(
    command: string,
    args: string[],
    refreshTrigger: number,
    interval = 10000
): ServiceStatusResult {
    const [status, setStatus] = useState<ServiceStatusValue>("unknown");
    const [output, setOutput] = useState("");
    const [lastChecked, setLastChecked] = useState<Date | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [manualTrigger, setManualTrigger] = useState(0);

    const refresh = useCallback(() => {
        setManualTrigger((prev) => prev + 1);
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function check(): Promise<void> {
            setIsLoading(true);
            try {
                const result = await execa(command, args, { reject: false });

                if (cancelled) return;

                const stdout = result.stdout?.trim() ?? "";
                const stderr = result.stderr?.trim() ?? "";
                const fullOutput = stdout + (stderr ? `\n${stderr}` : "");

                setOutput(fullOutput);
                setLastChecked(new Date());

                if (result.exitCode === 0) {
                    // Parse the output to determine status
                    const lower = fullOutput.toLowerCase();
                    if (
                        lower.includes("active (running)") ||
                        lower.includes("is running") ||
                        lower.includes("status: active")
                    ) {
                        setStatus("running");
                    } else if (
                        lower.includes("active (waiting)") ||
                        lower.includes("active (exited)") ||
                        lower.includes("loaded") ||
                        lower.includes("enabled")
                    ) {
                        setStatus("active");
                    } else if (
                        lower.includes("inactive") ||
                        lower.includes("dead") ||
                        lower.includes("not running")
                    ) {
                        setStatus("stopped");
                    } else {
                        setStatus("running");
                    }
                } else if (result.exitCode === 3) {
                    // systemctl returns 3 for "inactive" services.
                    // For timer-triggered oneshot services, inactive + successful
                    // exit is *normal* (it ran, finished, and is waiting for
                    // the next timer trigger). Detect this and report "active"
                    // instead of "stopped".
                    const lower = fullOutput.toLowerCase();
                    if (
                        lower.includes("code=exited, status=0/success") ||
                        lower.includes("result=success")
                    ) {
                        setStatus("active");
                    } else {
                        setStatus("stopped");
                    }
                } else if (result.exitCode === 4) {
                    // systemctl returns 4 for "unit not found"
                    setStatus("unknown");
                } else {
                    setStatus("error");
                }
            } catch {
                if (!cancelled) {
                    setStatus("unknown");
                    setOutput("Failed to check service status");
                    setLastChecked(new Date());
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        check();
        const timer = setInterval(check, interval);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [command, args.join(","), refreshTrigger, manualTrigger, interval]);

    return { status, output, lastChecked, isLoading, refresh };
}
