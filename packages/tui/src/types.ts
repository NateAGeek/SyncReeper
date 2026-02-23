import type { ServiceAction } from "./hooks/useServiceAction.js";
import type { ActionStatus } from "./hooks/useServiceAction.js";

/**
 * Common props passed from App to every tab for service action support.
 */
export interface TabActionProps {
    refreshTrigger: number;
    scrollOffset: number;
    serviceActionTrigger: { action: ServiceAction; seq: number };
    onActionUpdate: (status: ActionStatus, message: string) => void;
}
