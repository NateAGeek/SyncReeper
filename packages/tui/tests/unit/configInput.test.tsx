import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { ConfigInput } from "../../src/components/ConfigInput";

function waitForInput(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 20));
}

describe("ConfigInput", () => {
    it("never renders a masked value", () => {
        const instance = render(
            <ConfigInput
                label="Token"
                value="github_pat_secret"
                masked
                isActive
                onChange={() => undefined}
                onSubmit={() => undefined}
                onCancel={() => undefined}
            />
        );
        const frame = instance.lastFrame();

        expect(frame).toContain("[hidden]");
        expect(frame).not.toContain("github_pat_secret");
        instance.unmount();
    });

    it("submits and cancels through keyboard input", async () => {
        const onSubmit = vi.fn();
        const onCancel = vi.fn();
        const instance = render(
            <ConfigInput
                label="Value"
                value=""
                isActive
                onChange={() => undefined}
                onSubmit={onSubmit}
                onCancel={onCancel}
            />
        );

        await waitForInput();
        instance.stdin.write("\r");
        await waitForInput();
        expect(onSubmit).toHaveBeenCalledOnce();

        instance.stdin.write("\u001b");
        await waitForInput();
        expect(onCancel).toHaveBeenCalledOnce();
        instance.unmount();
    });

    it("ignores input while inactive", async () => {
        const onChange = vi.fn();
        const instance = render(
            <ConfigInput
                label="Value"
                value=""
                isActive={false}
                onChange={onChange}
                onSubmit={() => undefined}
                onCancel={() => undefined}
            />
        );

        instance.stdin.write("secret");
        await waitForInput();
        expect(onChange).not.toHaveBeenCalled();
        instance.unmount();
    });
});
