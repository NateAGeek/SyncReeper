import { useState, useEffect, useCallback } from "react";
import { execa } from "execa";

function redactSecrets(value: string): string {
    return value
        .replace(/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+\b/g, "[REDACTED]")
        .replace(/(https?:\/\/)[^\s/@]+@/g, "$1[REDACTED]@");
}

export interface LogsResult {
    lines: string[];
    error: string;
    exitCode: number | undefined;
    isLoading: boolean;
    refresh: () => void;
}

/**
 * Fetch log output from a system command and parse into lines.
 */
export function useLogs(
    command: string,
    args: string[],
    refreshTrigger: number,
    maxLines = 200
): LogsResult {
    const [lines, setLines] = useState<string[]>([]);
    const [error, setError] = useState("");
    const [exitCode, setExitCode] = useState<number | undefined>();
    const [isLoading, setIsLoading] = useState(true);
    const [manualTrigger, setManualTrigger] = useState(0);

    const refresh = useCallback(() => {
        setManualTrigger((prev) => prev + 1);
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function fetchLogs(): Promise<void> {
            setIsLoading(true);
            try {
                const result = await execa(command, args, { reject: false });

                if (cancelled) return;

                const stdout = redactSecrets(result.stdout?.trim() ?? "");
                const stderr = redactSecrets(result.stderr?.trim() ?? "");
                setExitCode(result.exitCode);
                if (result.exitCode !== 0) {
                    const message = stderr || stdout || "Log command failed without output";
                    setError(message);
                    setLines([`[exit ${result.exitCode ?? "unknown"}] ${message}`]);
                } else if (stdout.length > 0) {
                    const allLines = stdout.split("\n");
                    // Keep only the last maxLines
                    setLines(allLines.slice(-maxLines));
                    setError("");
                } else {
                    setLines([]);
                    setError("");
                }
            } catch (reason) {
                if (!cancelled) {
                    const message = redactSecrets(
                        reason instanceof Error ? reason.message : "Failed to fetch logs"
                    );
                    setError(message);
                    setExitCode(undefined);
                    setLines([`Failed to fetch logs: ${message}`]);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        fetchLogs();

        return () => {
            cancelled = true;
        };
    }, [command, args.join(","), refreshTrigger, manualTrigger, maxLines]);

    return { lines, error, exitCode, isLoading, refresh };
}
