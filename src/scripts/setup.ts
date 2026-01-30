#!/usr/bin/env npx tsx
/**
 * Interactive Setup Script for SyncReeper
 *
 * Prompts for configuration values and sets them in Pulumi config.
 * Run with: npm run setup
 */

import { input, password, confirm } from "@inquirer/prompts";
import { execa } from "execa";

async function runPulumiConfig(key: string, value: string, secret = false): Promise<void> {
    const args = ["config", "set", `syncreeper:${key}`, value];
    if (secret) {
        args.push("--secret");
    }
    await execa("pulumi", args, { stdio: "inherit" });
}

async function runPulumiConfigJson(key: string, value: unknown): Promise<void> {
    const jsonValue = JSON.stringify(value);
    await execa("pulumi", ["config", "set", `syncreeper:${key}`, jsonValue], { stdio: "inherit" });
}

async function checkPulumiStack(): Promise<boolean> {
    try {
        await execa("pulumi", ["stack", "--show-name"]);
        return true;
    } catch {
        return false;
    }
}

async function main(): Promise<void> {
    console.log("\n🔧 SyncReeper Setup\n");
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

    // GitHub Configuration
    console.log("📦 GitHub Configuration\n");

    const githubUsername = await input({
        message: "GitHub username:",
        validate: (v) => v.length > 0 || "Username is required",
    });

    const githubToken = await password({
        message: "GitHub Personal Access Token (with 'repo' scope):",
        validate: (v) => v.length > 0 || "Token is required",
    });

    // Syncthing Configuration
    console.log("\n📡 Syncthing Configuration\n");

    const syncthingApiKey = await password({
        message: "Syncthing API Key (generate a random string):",
        default: generateRandomKey(32),
        validate: (v) => v.length >= 16 || "API key must be at least 16 characters",
    });

    const trustedDevicesInput = await input({
        message: "Trusted device IDs (comma-separated, or leave empty):",
        default: "",
    });

    const trustedDevices = trustedDevicesInput
        .split(",")
        .map((d) => d.trim())
        .filter((d) => d.length > 0);

    // SSH Configuration
    console.log("\n🔐 SSH Configuration\n");

    const sshKeysInput = await input({
        message: "SSH public keys (comma-separated, or paste one key):",
        validate: (v) => v.length > 0 || "At least one SSH key is required",
    });

    const sshKeys = sshKeysInput.includes(",")
        ? sshKeysInput.split(",").map((k) => k.trim())
        : [sshKeysInput.trim()];

    // Optional Configuration
    console.log("\n⚙️  Optional Configuration\n");

    const useDefaults = await confirm({
        message:
            "Use default settings for sync schedule (daily at 3 AM) and repos path (/srv/repos)?",
        default: true,
    });

    let syncSchedule = "daily";
    let reposPath = "/srv/repos";

    if (!useDefaults) {
        syncSchedule = await input({
            message: "Sync schedule (systemd calendar format):",
            default: "daily",
        });

        reposPath = await input({
            message: "Repository storage path:",
            default: "/srv/repos",
        });
    }

    // Confirm and save
    console.log("\n📋 Configuration Summary\n");
    console.log(`  GitHub Username:    ${githubUsername}`);
    console.log(`  GitHub Token:       ${"*".repeat(10)}...`);
    console.log(`  Syncthing API Key:  ${"*".repeat(10)}...`);
    console.log(
        `  Trusted Devices:    ${trustedDevices.length > 0 ? trustedDevices.join(", ") : "(none yet)"}`
    );
    console.log(`  SSH Keys:           ${sshKeys.length} key(s)`);
    console.log(`  Sync Schedule:      ${syncSchedule}`);
    console.log(`  Repos Path:         ${reposPath}`);
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
    console.log("\n💾 Saving configuration...\n");

    await runPulumiConfig("github-username", githubUsername);
    await runPulumiConfig("github-token", githubToken, true);
    await runPulumiConfig("syncthing-api-key", syncthingApiKey, true);
    await runPulumiConfigJson("syncthing-trusted-devices", trustedDevices);
    await runPulumiConfigJson("ssh-authorized-keys", sshKeys);
    await runPulumiConfig("sync-schedule", syncSchedule);
    await runPulumiConfig("repos-path", reposPath);

    console.log("\n✅ Configuration saved successfully!\n");
    console.log("Next steps:");
    console.log("  1. Review: pulumi config");
    console.log("  2. Deploy: pulumi up");
    console.log();
}

function generateRandomKey(length: number): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

main().catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
});
