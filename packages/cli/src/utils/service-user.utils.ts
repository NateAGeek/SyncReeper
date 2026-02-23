/**
 * Shared utility for resolving the service username.
 *
 * Extracted from the duplicated getDefaultServiceUser() in each host-utils script.
 *
 * Priority:
 *   1. Explicit --user flag (passed as argument)
 *   2. Pulumi config: syncreeper:service-user
 *   3. Platform default: current user (macOS) or "syncreeper" (Linux)
 */

import * as os from "node:os";
import { execa } from "execa";
import { DEFAULT_SERVICE_USER_LINUX } from "@syncreeper/shared";

export async function resolveServiceUser(explicit?: string): Promise<string> {
    if (explicit) return explicit;

    try {
        const result = await execa("pulumi", ["config", "get", "syncreeper:service-user"], {
            reject: false,
        });
        if (result.exitCode === 0 && result.stdout.trim()) {
            return result.stdout.trim();
        }
    } catch {
        // Fall through to platform default
    }

    if (process.platform === "darwin") {
        return os.userInfo().username;
    }
    return DEFAULT_SERVICE_USER_LINUX;
}

/**
 * Simpler version for setup.ts (no Pulumi query needed, just platform default)
 */
export function getDefaultServiceUser(): string {
    if (process.platform === "darwin") {
        return os.userInfo().username;
    }
    return DEFAULT_SERVICE_USER_LINUX;
}
