import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { DEFAULT_SERVICE_USER_LINUX, isLinux } from "@syncreeper/shared";
import { asServiceUser, isRoot } from "./userCommand.utils.js";

interface PulumiConfigEntry {
    value?: string;
    objectValue?: unknown;
    secret?: boolean;
    secure?: string;
}

export interface ConfigSnapshot {
    stack: string;
    values: Record<string, string | undefined>;
    secrets: ReadonlySet<string>;
    serviceUser: string;
}

export interface ConfigUpdateResult {
    applied: boolean;
    message: string;
}

export class PulumiPassphraseRequiredError extends Error {
    constructor() {
        super("Pulumi requires its secrets passphrase");
        this.name = "PulumiPassphraseRequiredError";
    }
}

export function isPulumiPassphraseRequired(error: unknown): boolean {
    return error instanceof PulumiPassphraseRequiredError;
}

export function getProjectRoot(): string {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(directory, "..", "..", "..", "..");
}

function commandError(stdout: string, stderr: string, fallback: string): string {
    return stderr.trim() || stdout.trim() || fallback;
}

function requiresPassphrase(stdout: string, stderr: string): boolean {
    return /passphrase|decrypt|secret provider|unable to load checkpoint/i.test(
        `${stdout}\n${stderr}`
    );
}

function pulumiEnv(passphrase?: string): NodeJS.ProcessEnv | undefined {
    if (!passphrase) return undefined;
    return { ...process.env, PULUMI_CONFIG_PASSPHRASE: passphrase };
}

export async function loadConfigSnapshot(): Promise<ConfigSnapshot> {
    const cwd = getProjectRoot();
    const [stackResult, configResult] = await Promise.all([
        execa("pulumi", ["stack", "--show-name", "--non-interactive"], {
            cwd,
            reject: false,
        }),
        execa("pulumi", ["config", "--json", "--non-interactive"], {
            cwd,
            reject: false,
        }),
    ]);

    if (stackResult.exitCode !== 0) {
        throw new Error(
            commandError(stackResult.stdout, stackResult.stderr, "Unable to determine Pulumi stack")
        );
    }
    if (configResult.exitCode !== 0) {
        throw new Error(
            commandError(configResult.stdout, configResult.stderr, "Unable to read Pulumi config")
        );
    }

    const parsed = JSON.parse(configResult.stdout) as Record<string, PulumiConfigEntry>;
    const values: Record<string, string | undefined> = {};
    const secrets = new Set<string>();

    for (const [key, entry] of Object.entries(parsed)) {
        if (!key.startsWith("syncreeper:")) continue;
        if (entry.secret || typeof entry.secure === "string") {
            secrets.add(key);
            values[key] = undefined;
        } else {
            values[key] = entry.value;
        }
    }

    return {
        stack: stackResult.stdout.trim(),
        values,
        secrets,
        serviceUser: values["syncreeper:service-user"] ?? DEFAULT_SERVICE_USER_LINUX,
    };
}

export function validateGitHubToken(value: string): string | null {
    if (value.length < 20) return "GitHub tokens must be at least 20 characters";
    if (!/^[A-Za-z0-9_]+$/.test(value)) return "Token contains unsupported characters";
    return null;
}

async function setPulumiConfig(
    key: string,
    value: string,
    secret: boolean,
    passphrase?: string
): Promise<void> {
    const args = ["config", "set", key];
    if (secret) args.push("--secret");

    const result = await execa("pulumi", args, {
        cwd: getProjectRoot(),
        input: value,
        reject: false,
        env: pulumiEnv(passphrase),
    });
    if (result.exitCode !== 0) {
        if (!passphrase && requiresPassphrase(result.stdout, result.stderr)) {
            throw new PulumiPassphraseRequiredError();
        }
        throw new Error(commandError(result.stdout, result.stderr, "Pulumi config update failed"));
    }
}

export async function updatePulumiConfig(
    key: string,
    value: string,
    secret = false,
    passphrase?: string
): Promise<ConfigUpdateResult> {
    await setPulumiConfig(key, value, secret, passphrase);
    return {
        applied: false,
        message: `${key} saved; run pulumi up to apply infrastructure changes`,
    };
}

async function applyTargetedPulumiResource(
    stack: string,
    resource: string,
    passphrase?: string
): Promise<void> {
    const target = `urn:pulumi:${stack}::syncreeper::command:local:Command::${resource}`;
    const result = await execa(
        "pulumi",
        [
            "up",
            "--yes",
            "--skip-preview",
            "--non-interactive",
            "--suppress-outputs",
            "--target",
            target,
        ],
        {
            cwd: getProjectRoot(),
            reject: false,
            timeout: 300000,
            env: pulumiEnv(passphrase),
        }
    );

    if (result.exitCode !== 0) {
        if (!passphrase && requiresPassphrase(result.stdout, result.stderr)) {
            throw new PulumiPassphraseRequiredError();
        }
        throw new Error(commandError(result.stdout, result.stderr, "targeted update failed"));
    }
}

export async function applySyncthingTrustedDevices(
    value: string,
    snapshot: ConfigSnapshot,
    passphrase?: string
): Promise<ConfigUpdateResult> {
    if (!isLinux()) {
        throw new Error("Live Syncthing configuration is currently supported on Linux only");
    }
    if (!isRoot()) {
        throw new Error("Run the dashboard as root to apply live Syncthing configuration");
    }

    await setPulumiConfig("syncreeper:syncthing-trusted-devices", value, false, passphrase);
    await applyTargetedPulumiResource(snapshot.stack, "configure-syncthing-cli", passphrase);

    const restart = await execa(
        "systemctl",
        ["restart", `syncthing@${snapshot.serviceUser}.service`],
        { reject: false, timeout: 300000 }
    );
    if (restart.exitCode !== 0) {
        throw new Error(
            `Syncthing configuration applied, but restart failed: ${commandError(
                restart.stdout,
                restart.stderr,
                "service restart failed"
            )}`
        );
    }

    return { applied: true, message: "Trusted devices applied to the live Syncthing service" };
}

export async function rotateGitHubToken(
    token: string,
    snapshot: ConfigSnapshot,
    passphrase?: string
): Promise<ConfigUpdateResult> {
    const validationError = validateGitHubToken(token);
    if (validationError) throw new Error(validationError);
    if (!isLinux()) throw new Error("Live token rotation is currently supported on Linux only");
    if (!isRoot()) throw new Error("Run the dashboard as root to rotate the live GitHub token");

    await setPulumiConfig("syncreeper:github-token", token, true, passphrase);

    try {
        await applyTargetedPulumiResource(snapshot.stack, "sync-env-file", passphrase);
    } catch (reason) {
        if (reason instanceof PulumiPassphraseRequiredError) throw reason;
        throw new Error(
            `Token saved in Pulumi, but live apply failed: ${reason instanceof Error ? reason.message : "targeted update failed"}`
        );
    }

    const restart = asServiceUser(
        "systemctl",
        ["--user", "restart", "syncreeper-sync.service"],
        snapshot.serviceUser
    );
    const restartResult = await execa(restart.command, restart.args, {
        reject: false,
        timeout: 300000,
    });
    if (restartResult.exitCode !== 0) {
        const reason = commandError(
            restartResult.stdout,
            restartResult.stderr,
            "service restart failed"
        );
        throw new Error(`Token applied, but the sync service failed: ${reason}`);
    }

    return { applied: true, message: "GitHub token rotated and sync completed successfully" };
}

export function parseConfigList(value: string | undefined): string[] {
    if (!value) return [];
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === "string")
            : [];
    } catch {
        return [];
    }
}
