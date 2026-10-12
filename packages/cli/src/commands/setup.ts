/**
 * setup command - Interactive Setup Script for SyncReeper
 *
 * Migrated from packages/host-utils/src/setup.ts
 * Prompts for configuration values and sets them in Pulumi config.
 */

import * as os from "node:os";
import type { CommandModule } from "yargs";
import { input, password, confirm } from "@inquirer/prompts";
import { execa } from "execa";
import { getDefaultServiceUser } from "../utils/service-user.utils.js";

interface ExistingConfigEntry {
    secret?: boolean;
    secure?: string;
}

export function getConfiguredKeys(config: Record<string, ExistingConfigEntry>): Set<string> {
    return new Set(
        Object.entries(config)
            .filter(
                ([key, entry]) =>
                    key.startsWith("syncreeper:") &&
                    (entry.secret === true || typeof entry.secure === "string" || "value" in entry)
            )
            .map(([key]) => key)
    );
}

async function getExistingConfigKeys(): Promise<Set<string>> {
    const result = await execa("pulumi", ["config", "--json", "--non-interactive"], {
        reject: false,
    });
    if (result.exitCode !== 0 || !result.stdout.trim()) return new Set();

    try {
        const config = JSON.parse(result.stdout) as Record<string, ExistingConfigEntry>;
        return getConfiguredKeys(config);
    } catch {
        return new Set();
    }
}

async function runPulumiConfig(
    key: string,
    value: string,
    existingKeys: Set<string>,
    secret = false
): Promise<void> {
    const fullKey = `syncreeper:${key}`;
    if (
        existingKeys.has(fullKey) &&
        !(await confirm({
            message: `${fullKey} is already set. Replace it?`,
            default: false,
        }))
    ) {
        console.log(`Keeping existing ${fullKey}`);
        return;
    }

    const args = ["config", "set", fullKey];
    if (secret) {
        args.push("--secret");
    }
    await execa("pulumi", args, { input: value, stdio: ["pipe", "inherit", "inherit"] });
}

async function runPulumiConfigJson(
    key: string,
    value: unknown,
    existingKeys: Set<string>
): Promise<void> {
    const jsonValue = JSON.stringify(value);
    await runPulumiConfig(key, jsonValue, existingKeys);
}

async function checkPulumiStack(): Promise<boolean> {
    try {
        await execa("pulumi", ["stack", "--show-name"]);
        return true;
    } catch {
        return false;
    }
}

function generateRandomKey(length: number): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export const setupCommand: CommandModule = {
    command: "setup",
    describe: "Interactive setup wizard (configure Pulumi)",
    builder: {},
    handler: async () => {
        console.log("\nSyncReeper Setup\n");
        console.log("This script will configure the required settings for SyncReeper.");
        console.log("Make sure you have initialized a Pulumi stack first.\n");

        // Check if Pulumi stack exists
        const hasStack = await checkPulumiStack();
        if (!hasStack) {
            console.log("No Pulumi stack found. Creating one...\n");

            const stackName = await input({
                message: "Stack name:",
                default: "dev",
            });

            await execa("pulumi", ["stack", "init", stackName], { stdio: "inherit" });
            console.log();
        }

        // Service User Configuration
        console.log("Service User Configuration\n");

        const defaultUser = getDefaultServiceUser();
        const platformNote =
            process.platform === "darwin"
                ? "(macOS: must be an existing user)"
                : "(Linux: will be created if it doesn't exist)";

        const serviceUser = await input({
            message: `Service username ${platformNote}:`,
            default: defaultUser,
            validate: (v) => {
                if (v.length === 0) return "Username is required";
                if (!/^[a-z_][a-z0-9_-]*$/.test(v))
                    return "Username must start with a letter or underscore and contain only lowercase letters, digits, hyphens, or underscores";
                return true;
            },
        });

        // GitHub Configuration
        console.log("\nGitHub Configuration\n");

        const githubUsername = await input({
            message: "GitHub username:",
            validate: (v) => v.length > 0 || "Username is required",
        });

        const githubToken = await password({
            message: "GitHub Personal Access Token (with 'repo' scope):",
            validate: (v) => v.length > 0 || "Token is required",
        });

        // Syncthing Configuration
        console.log("\nSyncthing Configuration\n");

        const generatedApiKey = generateRandomKey(32);
        console.log(`  Generated API Key: ${generatedApiKey}`);
        console.log("  (Press Enter to use this, or type your own)\n");

        const syncthingApiKeyInput = await input({
            message: "Syncthing API Key:",
            default: generatedApiKey,
            validate: (v) => v.length >= 16 || "API key must be at least 16 characters",
        });
        const syncthingApiKey = syncthingApiKeyInput || generatedApiKey;

        const trustedDevicesInput = await input({
            message: "Trusted device IDs (comma-separated, or leave empty):",
            default: "",
        });

        const trustedDevices = trustedDevicesInput
            .split(",")
            .map((d) => d.trim())
            .filter((d) => d.length > 0);

        // SSH Configuration
        console.log("\nSSH Configuration\n");

        const sshKeysInput = await input({
            message: "SSH public keys (comma-separated, or paste one key):",
            validate: (v) => v.length > 0 || "At least one SSH key is required",
        });

        const sshKeys = sshKeysInput.includes(",")
            ? sshKeysInput.split(",").map((k) => k.trim())
            : [sshKeysInput.trim()];

        // Optional Configuration
        console.log("\nOptional Configuration\n");

        const defaultReposPath =
            process.platform === "darwin" ? `${os.homedir()}/SyncReeper/repos` : "/srv/repos";

        const useDefaults = await confirm({
            message: `Use default settings for sync schedule (daily at 3 AM), repos path (${defaultReposPath}), and folder ID (repos)?`,
            default: true,
        });

        let syncSchedule = "daily";
        let reposPath = defaultReposPath;
        let syncthingFolderId = "repos";

        if (!useDefaults) {
            syncSchedule = await input({
                message: "Sync schedule (systemd calendar format):",
                default: "daily",
            });

            reposPath = await input({
                message: "Repository storage path:",
                default: defaultReposPath,
            });

            syncthingFolderId = await input({
                message: "Syncthing folder ID (must match on all devices):",
                default: "repos",
                validate: (v) =>
                    /^[a-zA-Z0-9_-]+$/.test(v) || "Only alphanumeric, dash, and underscore allowed",
            });
        }

        // Confirm and save
        console.log("\nConfiguration Summary\n");
        console.log(`  Service User:       ${serviceUser}`);
        console.log(`  GitHub Username:    ${githubUsername}`);
        console.log(`  GitHub Token:       ${"*".repeat(10)}...`);
        console.log(`  Syncthing API Key:  ${"*".repeat(10)}...`);
        console.log(
            `  Trusted Devices:    ${trustedDevices.length > 0 ? trustedDevices.join(", ") : "(none yet)"}`
        );
        console.log(`  SSH Keys:           ${sshKeys.length} key(s)`);
        console.log(`  Sync Schedule:      ${syncSchedule}`);
        console.log(`  Repos Path:         ${reposPath}`);
        console.log(`  Syncthing Folder ID: ${syncthingFolderId}`);
        console.log();

        const proceed = await confirm({
            message: "Save this configuration?",
            default: true,
        });

        if (!proceed) {
            console.log("\nSetup cancelled.\n");
            process.exit(0);
        }

        // Save configuration
        console.log("\nSaving configuration...\n");

        const existingKeys = await getExistingConfigKeys();

        await runPulumiConfig("service-user", serviceUser, existingKeys);
        await runPulumiConfig("github-username", githubUsername, existingKeys);
        await runPulumiConfig("github-token", githubToken, existingKeys, true);
        await runPulumiConfig("syncthing-api-key", syncthingApiKey, existingKeys, true);
        await runPulumiConfigJson("syncthing-trusted-devices", trustedDevices, existingKeys);
        await runPulumiConfigJson("ssh-authorized-keys", sshKeys, existingKeys);
        await runPulumiConfig("sync-schedule", syncSchedule, existingKeys);
        await runPulumiConfig("repos-path", reposPath, existingKeys);
        await runPulumiConfig("syncthing-folder-id", syncthingFolderId, existingKeys);

        console.log("\nConfiguration saved successfully!\n");
        console.log("Next steps:");
        console.log("  1. Review: pulumi config");
        console.log("  2. Deploy: pulumi up");
        console.log();
    },
};
