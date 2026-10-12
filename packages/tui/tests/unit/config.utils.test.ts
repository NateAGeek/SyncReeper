import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExeca } = vi.hoisted(() => ({ mockExeca: vi.fn() }));

vi.mock("execa", () => ({ execa: mockExeca }));
vi.mock("@syncreeper/shared", () => ({
    DEFAULT_SERVICE_USER_LINUX: "syncreeper",
    isLinux: () => true,
}));
vi.mock("../../src/utils/userCommand.utils", () => ({
    asServiceUser: (command: string, args: string[], user: string) => ({
        command: "sudo",
        args: ["-u", user, command, ...args],
    }),
    isRoot: () => true,
}));

import {
    loadConfigSnapshot,
    applySyncthingTrustedDevices,
    rotateGitHubToken,
    updatePulumiConfig,
    validateGitHubToken,
    PulumiPassphraseRequiredError,
    type ConfigSnapshot,
} from "../../src/utils/config.utils";

function result(stdout = "", stderr = "", exitCode = 0) {
    return { stdout, stderr, exitCode };
}

describe("config.utils", () => {
    beforeEach(() => vi.clearAllMocks());

    it("loads public values without exposing secret values", async () => {
        mockExeca.mockResolvedValueOnce(result("dev\n")).mockResolvedValueOnce(
            result(
                JSON.stringify({
                    "syncreeper:github-token": { secret: true, value: "must-not-leak" },
                    "syncreeper:github-username": { secret: false, value: "octocat" },
                    "syncreeper:service-user": { secret: false, value: "syncuser" },
                    "pulumi:tags": { secret: false, value: "internal" },
                })
            )
        );

        const snapshot = await loadConfigSnapshot();

        expect(snapshot.stack).toBe("dev");
        expect(snapshot.serviceUser).toBe("syncuser");
        expect(snapshot.values["syncreeper:github-username"]).toBe("octocat");
        expect(snapshot.values["syncreeper:github-token"]).toBeUndefined();
        expect(snapshot.secrets.has("syncreeper:github-token")).toBe(true);
        expect(JSON.stringify(snapshot)).not.toContain("must-not-leak");
        expect(mockExeca.mock.calls.flat(2)).not.toContain("--show-secrets");
    });

    it("recognizes Pulumi secure entries without retaining ciphertext", async () => {
        mockExeca.mockResolvedValueOnce(result("dev\n")).mockResolvedValueOnce(
            result(
                JSON.stringify({
                    "syncreeper:github-token": {
                        secure: "v1:encrypted-ciphertext",
                    },
                })
            )
        );

        const snapshot = await loadConfigSnapshot();

        expect(snapshot.secrets.has("syncreeper:github-token")).toBe(true);
        expect(JSON.stringify(snapshot)).not.toContain("encrypted-ciphertext");
    });

    it("passes config values through stdin instead of argv", async () => {
        mockExeca.mockResolvedValue(result());

        await updatePulumiConfig("syncreeper:github-username", "octocat");

        const [, args, options] = mockExeca.mock.calls[0]!;
        expect(args).toEqual(["config", "set", "syncreeper:github-username"]);
        expect(args).not.toContain("octocat");
        expect(options.input).toBe("octocat");
    });

    it("rotates a token through Pulumi then restarts the configured service user", async () => {
        const token = "github_pat_12345678901234567890";
        const snapshot: ConfigSnapshot = {
            stack: "dev",
            values: {},
            secrets: new Set(["syncreeper:github-token"]),
            serviceUser: "syncuser",
        };
        mockExeca.mockResolvedValue(result());

        await rotateGitHubToken(token, snapshot);

        expect(mockExeca).toHaveBeenCalledTimes(3);
        expect(mockExeca.mock.calls[0]![1]).toEqual([
            "config",
            "set",
            "syncreeper:github-token",
            "--secret",
        ]);
        expect(mockExeca.mock.calls[0]![2].input).toBe(token);
        expect(mockExeca.mock.calls[0]![1]).not.toContain(token);
        expect(mockExeca.mock.calls[1]![1]).toContain(
            "urn:pulumi:dev::syncreeper::command:local:Command::sync-env-file"
        );
        expect(mockExeca.mock.calls[2]![1]).toEqual([
            "-u",
            "syncuser",
            "systemctl",
            "--user",
            "restart",
            "syncreeper-sync.service",
        ]);
    });

    it("applies trusted devices through the Syncthing resource and restarts the daemon", async () => {
        const snapshot: ConfigSnapshot = {
            stack: "dev",
            values: {},
            secrets: new Set(),
            serviceUser: "syncuser",
        };
        mockExeca.mockResolvedValue(result());

        await applySyncthingTrustedDevices('["DEVICE-ONE"]', snapshot);

        expect(mockExeca.mock.calls[0]![1]).toEqual([
            "config",
            "set",
            "syncreeper:syncthing-trusted-devices",
        ]);
        expect(mockExeca.mock.calls[1]![1]).toContain(
            "urn:pulumi:dev::syncreeper::command:local:Command::configure-syncthing-cli"
        );
        expect(mockExeca.mock.calls[2]![1]).toEqual(["restart", "syncthing@syncuser.service"]);
    });

    it("does not apply or restart when saving the secret fails", async () => {
        mockExeca.mockResolvedValueOnce(result("", "permission denied", 1));
        const snapshot: ConfigSnapshot = {
            stack: "dev",
            values: {},
            secrets: new Set(),
            serviceUser: "syncreeper",
        };

        await expect(
            rotateGitHubToken("github_pat_12345678901234567890", snapshot)
        ).rejects.toThrow("permission denied");
        expect(mockExeca).toHaveBeenCalledTimes(1);
    });

    it("reports when Pulumi needs a passphrase", async () => {
        mockExeca.mockResolvedValue(result("", "Please set PULUMI_CONFIG_PASSPHRASE", 1));

        await expect(
            updatePulumiConfig("syncreeper:sync-schedule", "hourly")
        ).rejects.toBeInstanceOf(PulumiPassphraseRequiredError);
    });

    it("validates token shape", () => {
        expect(validateGitHubToken("short")).toContain("20 characters");
        expect(validateGitHubToken("github token with spaces 12345")).toContain("unsupported");
        expect(validateGitHubToken("github_pat_12345678901234567890")).toBeNull();
    });
});
