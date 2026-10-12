import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as pulumi from "@pulumi/pulumi";
import {
    getSSHLoginNotificationConfig,
    LOGIN_NOTIFICATION_SCRIPT,
} from "../../src/services/ssh/login-notification";

afterEach(() => vi.restoreAllMocks());

describe("SSH login ntfy watcher", () => {
    it("is disabled without a topic and does not load other settings", () => {
        vi.spyOn(pulumi.Config.prototype, "getSecret").mockReturnValue(undefined);
        const get = vi.spyOn(pulumi.Config.prototype, "get");
        expect(getSSHLoginNotificationConfig()).toBeUndefined();
        expect(get).not.toHaveBeenCalled();
    });

    it("keeps topic configuration secret and supports ntfy without a token", async () => {
        vi.spyOn(pulumi.Config.prototype, "getSecret").mockImplementation((key) =>
            key === "ssh-login-ntfy-topic" ? pulumi.secret("test-private-topic") : undefined
        );
        vi.spyOn(pulumi.Config.prototype, "get").mockReturnValue(undefined);
        vi.spyOn(pulumi.Config.prototype, "getObject").mockReturnValue(undefined);
        const settings = getSSHLoginNotificationConfig();
        expect(settings).toBeDefined();
        expect(await pulumi.isSecret(settings!)).toBe(true);
        const value = await new Promise((resolve) => settings!.apply(resolve));
        expect(value).toEqual({
            topic: "test-private-topic",
            server: "https://ntfy.sh",
            token: undefined,
            ignoreUsers: [],
        });
    });

    it("loads an exact ignored-user list from config", async () => {
        vi.spyOn(pulumi.Config.prototype, "getSecret").mockImplementation((key) =>
            key === "ssh-login-ntfy-topic" ? pulumi.secret("test-private-topic") : undefined
        );
        vi.spyOn(pulumi.Config.prototype, "get").mockReturnValue(undefined);
        vi.spyOn(pulumi.Config.prototype, "getObject").mockReturnValue(["passthrough"]);
        const settings = getSSHLoginNotificationConfig()!;
        const value = await new Promise((resolve) => settings.apply(resolve));
        expect(value).toMatchObject({ ignoreUsers: ["passthrough"] });
    });

    it.each(["passthrough", [123], [""], ["two users"]])(
        "rejects an invalid ignored-user list: %j",
        (ignoreUsers) => {
            vi.spyOn(pulumi.Config.prototype, "getSecret").mockReturnValue(
                pulumi.secret("test-private-topic")
            );
            vi.spyOn(pulumi.Config.prototype, "get").mockReturnValue(undefined);
            vi.spyOn(pulumi.Config.prototype, "getObject").mockReturnValue(ignoreUsers);
            expect(() => getSSHLoginNotificationConfig()).toThrow("array of non-empty usernames");
        }
    );

    it("only publishes successful authentications over verified HTTPS and retries failures", () => {
        const result = spawnSync(
            "python3",
            [
                "-c",
                `${LOGIN_NOTIFICATION_SCRIPT.replace('if __name__ == "__main__":', "if False:")}\n${String.raw`
from unittest.mock import patch, MagicMock

config = {"server": "https://ntfy.example.com", "topic": "test-private-topic",
          "token": "test-token"}
def entry(message):
    return {"MESSAGE": message, "__REALTIME_TIMESTAMP": "1700000000000000"}

with patch("urllib.request.build_opener") as client:
    for ignored in ["Failed publickey for user from 1.2.3.4 port 123 ssh2",
                    "pam_unix(sshd:session): session opened for user user",
                    "Disconnected from user user 1.2.3.4 port 123",
                    "Accepted publickey for malformed"]:
        send_notification(config, entry(ignored))
    client.assert_not_called()
    for user, ip in [("syncreeper", "1.2.3.4"), ("passthrough", "2001:db8::1")]:
        send_notification(config, entry(f"Accepted publickey for {user} from {ip} port 123 ssh2: ED25519 SHA256:key"))
        request = client.return_value.open.call_args.args[0]
        message = json.loads(request.data)
        assert message["topic"] == config["topic"]
        assert user in message["title"]
        assert ip in message["message"]
        assert "2023-11-14T22:13:20+00:00" in message["message"]
        assert "test-token" not in request.data.decode()
        assert request.full_url == config["server"]
        assert request.method == "POST"
        assert request.get_header("Authorization") == "Bearer test-token"
        assert client.return_value.open.call_args.kwargs["timeout"] == 30
    assert client.return_value.open.call_count == 2
    context = client.call_args.args[0]._context
    assert context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED
    assert client.call_args.args[1].redirect_request(None, None, 302, None, None,
                                                   "https://other.example.com") is None

config.pop("token")
with patch("urllib.request.build_opener") as client:
    send_notification(config, entry("Accepted publickey for user from 1.2.3.4 port 123 ssh2"))
    request = client.return_value.open.call_args.args[0]
    assert request.get_header("Authorization") is None
    client.return_value.open.assert_called_once()

config["ignoreUsers"] = ["passthrough"]
with patch("urllib.request.build_opener") as client:
    for ip in ["1.2.3.4", "2001:db8::1"]:
        send_notification(config, entry(f"Accepted publickey for passthrough from {ip} port 123 ssh2"))
    client.assert_not_called()
    for user in ["syncreeper", "passthrough-admin"]:
        send_notification(config, entry(f"Accepted publickey for {user} from 1.2.3.4 port 123 ssh2"))
    assert client.return_value.open.call_count == 2

# A failed delivery must be retried before its cursor is saved.
with patch("builtins.open", MagicMock()) as source, \
     patch("json.load", return_value=config), \
     patch("pathlib.Path") as path, \
     patch("subprocess.Popen") as process, \
     patch("__main__.send_notification") as send, \
     patch("time.sleep") as sleep, \
     patch("os.replace") as replace:
    cursor = path.return_value
    cursor.exists.return_value = True
    cursor.read_text.return_value = "previous-cursor"
    record = entry("Accepted publickey for user from 1.2.3.4 port 123 ssh2")
    record["__CURSOR"] = "next-cursor"
    process.return_value.__enter__.return_value.stdout = [json.dumps(record)]
    def deliver(*args):
        if send.call_count == 1:
            cursor.with_suffix.return_value.write_text.assert_not_called()
            replace.assert_not_called()
            raise urllib.error.HTTPError(config["server"], 503, "temporary failure", {}, None)
    send.side_effect = deliver
    try:
        main()
    except RuntimeError as error:
        assert str(error) == "SSH journal stream ended"
    assert send.call_count == 2
    sleep.assert_called_once_with(60)
    cursor.with_suffix.return_value.write_text.assert_called_once_with("next-cursor")
    replace.assert_called_once()
    assert "--after-cursor=previous-cursor" in process.call_args.args[0]
`}`,
            ],
            { encoding: "utf8" }
        );
        expect(result.error).toBeUndefined();
        expect(result.stderr).not.toContain("Traceback");
        expect(result.status).toBe(0);
    });
});
