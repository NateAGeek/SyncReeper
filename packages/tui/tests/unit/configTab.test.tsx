import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { ConfigTab } from "../../src/tabs/ConfigTab";
import type { ConfigSnapshot } from "../../src/utils/config.utils";

const snapshot: ConfigSnapshot = {
    stack: "dev",
    serviceUser: "syncreeper",
    secrets: new Set(["syncreeper:github-token"]),
    values: {
        "syncreeper:github-username": "octocat",
        "syncreeper:sync-schedule": "daily",
        "syncreeper:repos-path": "/srv/repos",
        "syncreeper:syncthing-folder-id": "repos",
        "syncreeper:syncthing-trusted-devices": '["DEVICE-ONE","DEVICE-TWO"]',
        "syncreeper:passthrough-enabled": "true",
        "syncreeper:passthrough-port": "2222",
    },
};

describe("ConfigTab", () => {
    it("groups public configuration and masks secret values", () => {
        const instance = render(
            <ConfigTab
                snapshot={snapshot}
                error=""
                isLoading={false}
                isActive={false}
                onRefresh={vi.fn()}
                onEditingChange={vi.fn()}
                onActionUpdate={vi.fn()}
            />
        );
        const frame = instance.lastFrame();

        expect(frame).toContain("GitHub Sync");
        expect(frame).toContain("Syncthing");
        expect(frame).toContain("Passthrough");
        expect(frame).toContain("octocat");
        expect(frame).toContain("[secret configured]");
        expect(frame).not.toContain("github_pat_");
        instance.unmount();
    });
});
