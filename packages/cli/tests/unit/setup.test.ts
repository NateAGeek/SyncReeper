import { describe, expect, it } from "vitest";
import { getConfiguredKeys } from "../../src/commands/setup";

describe("setup configuration detection", () => {
    it("detects public, secret, and encrypted Pulumi values without reading secrets", () => {
        const keys = getConfiguredKeys({
            "syncreeper:github-username": { value: "octocat" },
            "syncreeper:github-token": { secret: true },
            "syncreeper:syncthing-api-key": { secure: "ciphertext" },
            "pulumi:tags": { value: "internal" },
        });

        expect([...keys]).toEqual([
            "syncreeper:github-username",
            "syncreeper:github-token",
            "syncreeper:syncthing-api-key",
        ]);
    });

    it("treats partial configuration as existing configuration", () => {
        const keys = getConfiguredKeys({
            "syncreeper:github-token": { secret: true },
        });

        expect(keys.has("syncreeper:github-token")).toBe(true);
    });
});
