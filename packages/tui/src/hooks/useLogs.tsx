import { useState, useEffect, useCallback } from "react";
import { execa } from "execa";

export interface LogsResult {
    lines: string[];
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

                const stdout = result.stdout?.trim() ?? "";
                if (stdout.length > 0) {
                    const allLines = stdout.split("\n");
                    // Keep only the last maxLines
                    setLines(allLines.slice(-maxLines));
                } else {
                    setLines([]);
                }
            } catch {
                if (!cancelled) {
                    setLines(["Failed to fetch logs"]);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        fetchLogs();
    }, [command, args.join(","), refreshTrigger, manualTrigger, maxLines]);

    return { lines, isLoading, refresh };
}
