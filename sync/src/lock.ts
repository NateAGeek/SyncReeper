/**
 * Lock file handling to prevent concurrent sync operations
 */

import * as lockfile from "proper-lockfile";
import * as fs from "node:fs";
import * as path from "node:path";

const LOCK_FILE_NAME = ".syncreeper.lock";

export interface LockOptions {
    /** Directory to create lock file in */
    lockDir: string;
    /** Stale lock timeout in milliseconds (default: 10 minutes) */
    staleTimeout?: number;
}

export interface LockResult {
    /** Whether lock was acquired */
    acquired: boolean;
    /** Release function (call when done) */
    release: () => Promise<void>;
    /** Error message if lock failed */
    error?: string;
}

/**
 * Attempts to acquire a lock for the sync operation
 * Prevents multiple sync processes from running simultaneously
 */
export async function acquireLock(options: LockOptions): Promise<LockResult> {
    const { lockDir, staleTimeout = 10 * 60 * 1000 } = options;
    const lockPath = path.join(lockDir, LOCK_FILE_NAME);

    // Ensure lock directory exists
    if (!fs.existsSync(lockDir)) {
        fs.mkdirSync(lockDir, { recursive: true });
    }

    // Ensure lock file exists (proper-lockfile requires it)
    if (!fs.existsSync(lockPath)) {
        fs.writeFileSync(lockPath, "");
    }

    try {
        const release = await lockfile.lock(lockPath, {
            stale: staleTimeout,
            retries: 0, // Don't retry, fail immediately if locked
        });

        return {
            acquired: true,
            release: async () => {
                try {
                    await release();
                } catch {
                    // Ignore release errors
                }
            },
        };
    } catch (error) {
        if (error instanceof Error && error.message.includes("already locked")) {
            return {
                acquired: false,
                release: async () => {},
                error: "Another sync operation is in progress",
            };
        }

        return {
            acquired: false,
            release: async () => {},
            error: `Failed to acquire lock: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Checks if a sync operation is currently in progress
 */
export async function isLocked(lockDir: string): Promise<boolean> {
    const lockPath = path.join(lockDir, LOCK_FILE_NAME);

    if (!fs.existsSync(lockPath)) {
        return false;
    }

    try {
        const locked = await lockfile.check(lockPath);
        return locked;
    } catch {
        return false;
    }
}
