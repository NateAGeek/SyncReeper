import { useState, useEffect, useCallback } from "react";
import { execa } from "execa";

export type ServiceStatusValue =
    | "running"
    | "active"
    | "stopped"
    | "error"
    | "no_permission"
    | "unknown";

/**
 * Detect permission-related failures from sudo or D-Bus access.
 * `sudo -n` exits with 1 and prints "a password is required" when the user
 * lacks NOPASSWD. D-Bus/polkit failures contain "Permission denied" or
 * "not privileged".
 */
function isPermissionError(exitCode: number | undefined, output: string): boolean {
    if (exitCode === 0) return false;
    const lower = output.toLowerCase();
    return (
        lower.includes("a password is required") ||
        lower.includes("permission denied") ||
        lower.includes("not privileged") ||
        lower.includes("authentication is required") ||
        lower.includes("no password was provided") ||
        lower.includes("sudo: a terminal is required")
    );
}

export interface ServiceStatusResult {
    status: ServiceStatusValue;
    output: string;
    diagnostic: string;
    exitCode: number | undefined;
    lastChecked: Date | null;
    isLoading: boolean;
    refresh: () => void;
}

function summarizeDiagnostic(output: string, exitCode: number | undefined): string {
    const lines = output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const important = lines.find((line) =>
        /active:\s+failed|result:\s+exit-code|status=\d+\/failure|bad credentials|permission denied|unit .* not found/i.test(
            line
        )
    );
    const summary = important ?? lines[0] ?? "No diagnostic output";
    return exitCode === undefined ? summary : `exit ${exitCode}: ${summary}`;
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
    const [diagnostic, setDiagnostic] = useState("");
    const [exitCode, setExitCode] = useState<number | undefined>();
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
                setExitCode(result.exitCode);
                setLastChecked(new Date());

                const lower = fullOutput.toLowerCase();
                const failed =
                    lower.includes("active: failed") ||
                    lower.includes("result: exit-code") ||
                    /status=\d+\/failure/.test(lower);

                if (failed) {
                    setStatus("error");
                    setDiagnostic(summarizeDiagnostic(fullOutput, result.exitCode));
                } else if (result.exitCode === 0) {
                    // Parse the output to determine status
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
                    setDiagnostic("");
                } else if (isPermissionError(result.exitCode, fullOutput)) {
                    // sudo -n failed (no tty / no NOPASSWD rule) or D-Bus access denied
                    setStatus("no_permission");
                    setDiagnostic(summarizeDiagnostic(fullOutput, result.exitCode));
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
                        setDiagnostic("");
                    } else {
                        setStatus("stopped");
                        setDiagnostic(summarizeDiagnostic(fullOutput, result.exitCode));
                    }
                } else if (result.exitCode === 4) {
                    // systemctl returns 4 for "unit not found"
                    setStatus("unknown");
                    setDiagnostic(summarizeDiagnostic(fullOutput, result.exitCode));
                } else {
                    setStatus("error");
                    setDiagnostic(summarizeDiagnostic(fullOutput, result.exitCode));
                }
            } catch (reason) {
                if (!cancelled) {
                    setStatus("unknown");
                    const detail = reason instanceof Error ? reason.message : "unexpected error";
                    const message = `Failed to check service status: ${detail}`;
                    setOutput(message);
                    setDiagnostic(message);
                    setExitCode(undefined);
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

    return { status, output, diagnostic, exitCode, lastChecked, isLoading, refresh };
}
