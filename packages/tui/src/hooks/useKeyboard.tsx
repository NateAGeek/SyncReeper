import { useInput } from "ink";

export interface KeyboardHandlers {
    onTabNext?: () => void;
    onTabPrev?: () => void;
    onScrollDown?: () => void;
    onScrollUp?: () => void;
    onScrollTop?: () => void;
    onScrollBottom?: () => void;
    onRefresh?: () => void;
    onQuit?: () => void;
    onServiceStart?: () => void;
    onServiceStop?: () => void;
    onServiceRestart?: () => void;
}

export function useKeyboard(handlers: KeyboardHandlers): void {
    useInput((input, key) => {
        // Tab navigation
        if (key.tab && !key.shift) {
            handlers.onTabNext?.();
            return;
        }
        if (key.tab && key.shift) {
            handlers.onTabPrev?.();
            return;
        }

        // Arrow-based tab navigation
        if (key.rightArrow && key.ctrl) {
            handlers.onTabNext?.();
            return;
        }
        if (key.leftArrow && key.ctrl) {
            handlers.onTabPrev?.();
            return;
        }

        // Scroll
        if (input === "j" || key.downArrow) {
            handlers.onScrollDown?.();
            return;
        }
        if (input === "k" || key.upArrow) {
            handlers.onScrollUp?.();
            return;
        }

        // Jump scroll
        if (input === "G") {
            handlers.onScrollBottom?.();
            return;
        }
        if (input === "g") {
            handlers.onScrollTop?.();
            return;
        }

        // Refresh
        if (input === "r") {
            handlers.onRefresh?.();
            return;
        }

        // Quit
        if (input === "q") {
            handlers.onQuit?.();
            return;
        }

        // Service actions
        if (input === "s") {
            handlers.onServiceStart?.();
            return;
        }
        if (input === "x") {
            handlers.onServiceStop?.();
            return;
        }
        if (input === "R") {
            handlers.onServiceRestart?.();
            return;
        }
    });
}
