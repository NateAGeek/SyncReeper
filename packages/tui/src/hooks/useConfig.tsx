import { useCallback, useEffect, useState } from "react";
import { loadConfigSnapshot, type ConfigSnapshot } from "../utils/config.utils.js";

export interface ConfigResult {
    snapshot: ConfigSnapshot | null;
    error: string;
    isLoading: boolean;
    refresh: () => void;
}

export function useConfig(refreshTrigger: number): ConfigResult {
    const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [manualTrigger, setManualTrigger] = useState(0);

    const refresh = useCallback(() => setManualTrigger((value) => value + 1), []);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);

        loadConfigSnapshot()
            .then((value) => {
                if (!cancelled) {
                    setSnapshot(value);
                    setError("");
                }
            })
            .catch((reason: unknown) => {
                if (!cancelled) {
                    setError(
                        reason instanceof Error ? reason.message : "Unable to load configuration"
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [refreshTrigger, manualTrigger]);

    return { snapshot, error, isLoading, refresh };
}
