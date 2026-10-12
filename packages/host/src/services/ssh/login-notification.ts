/** Optional Linux SSH authentication notifications, delivered through ntfy HTTPS. */
import * as pulumi from "@pulumi/pulumi";
import { createHash } from "node:crypto";
import { isLinux } from "@syncreeper/shared";
import { runCommand, writeFile } from "../../lib/command";

export interface SSHLoginNotificationConfig {
    topic: string;
    server: string;
    token?: string;
    ignoreUsers?: string[];
}

export function getSSHLoginNotificationConfig():
    | pulumi.Output<SSHLoginNotificationConfig>
    | undefined {
    const config = new pulumi.Config("syncreeper");
    const topic = config.getSecret("ssh-login-ntfy-topic");
    if (!topic) return undefined;
    if (!isLinux()) throw new Error("SSH login notifications require Linux.");
    const server = config.get("ssh-login-ntfy-server") ?? "https://ntfy.sh";
    const url = new URL(server);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
        throw new Error("SSH login ntfy server must be an HTTPS URL without credentials or query.");
    }
    const ignoreUsers = config.getObject<unknown>("ssh-login-ntfy-ignore-users") ?? [];
    if (
        !Array.isArray(ignoreUsers) ||
        ignoreUsers.some((user) => typeof user !== "string" || !user || /\s/.test(user))
    ) {
        throw new Error("SSH login ntfy ignored users must be an array of non-empty usernames.");
    }
    return pulumi.secret(
        pulumi
            .all([topic, config.getSecret("ssh-login-ntfy-token") ?? pulumi.output("")])
            .apply(([topicValue, token]) => {
                if (!/^[A-Za-z0-9_-]{1,64}$/.test(topicValue)) {
                    throw new Error(
                        "SSH login ntfy topic must contain 1–64 letters, numbers, _ or -."
                    );
                }
                if (token && /[\r\n]/.test(token)) {
                    throw new Error("Invalid SSH login ntfy token.");
                }
                return {
                    topic: topicValue,
                    token: token || undefined,
                    server: server.replace(/\/+$/, ""),
                    ignoreUsers,
                };
            })
    );
}

// Kept inline so the compiled Pulumi package can deploy without copying assets.
export const LOGIN_NOTIFICATION_SCRIPT = String.raw`#!/usr/bin/python3
import datetime
import json
import logging
import os
import pathlib
import re
import socket
import ssl
import subprocess
import time
import urllib.error
import urllib.request

ACCEPTED = re.compile(r"^Accepted (\S+) for (\S+) from (\S+) port (\d+)(?:\s|$)")

def send_notification(config, entry):
    match = ACCEPTED.match(entry.get("MESSAGE", ""))
    if not match:
        return
    method, user, address, port = match.groups()
    if user in config.get("ignoreUsers", []):
        return
    host = socket.gethostname()
    timestamp = datetime.datetime.fromtimestamp(
        int(entry["__REALTIME_TIMESTAMP"]) / 1000000,
        datetime.timezone.utc,
    ).isoformat()
    message = (
        f"Successful SSH authentication\n\nHost: {host}\nUser: {user}\n"
        f"Source: {address}:{port}\nMethod: {method}\nTime (UTC): {timestamp}\n\n"
        f"SSH log: {entry['MESSAGE']}\n"
    )
    # Publish via ntfy's JSON API so topic and title never become URL/header values.
    payload = {"topic": config["topic"], "title": f"SSH login: {user} on {host}",
               "message": message, "tags": ["closed_lock_with_key"]}
    headers = {"Content-Type": "application/json"}
    if config.get("token"):
        headers["Authorization"] = "Bearer " + config["token"]
    request = urllib.request.Request(config["server"],
        data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    # Reject redirects to avoid sending a private topic/token to another endpoint.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ssl.create_default_context()), NoRedirect())
    with opener.open(request, timeout=30) as response:
        response.read()

def main():
    logging.basicConfig(level=logging.INFO)
    with open("/etc/syncreeper-ssh-login-notification.json") as source:
        config = json.load(source)
    cursor_file = pathlib.Path("/var/lib/syncreeper-ssh-login-notification/cursor")
    args = ["/usr/bin/journalctl", "--follow", "--output=json", "--no-pager",
            "--lines=all", "--identifier=sshd", "--identifier=sshd-session"]
    if cursor_file.exists():
        args.append("--after-cursor=" + cursor_file.read_text().strip())
    else:
        start_file = cursor_file.with_suffix(".since")
        if not start_file.exists():
            start_file.write_text(datetime.datetime.now(datetime.timezone.utc).strftime(
                "%Y-%m-%d %H:%M:%S UTC"))
        args.append("--since=" + start_file.read_text().strip())
    with subprocess.Popen(args, stdout=subprocess.PIPE, text=True) as journal:
        for line in journal.stdout:
            entry = json.loads(line)
            # Retry delivery before advancing the cursor; SSH itself never waits.
            while True:
                try:
                    send_notification(config, entry)
                    break
                except (OSError, urllib.error.URLError) as error:
                    logging.error("SSH login notification delivery failed (%s); retrying in 60s",
                                  type(error).__name__)
                    time.sleep(60)
            temporary = cursor_file.with_suffix(".tmp")
            temporary.write_text(entry["__CURSOR"])
            os.replace(temporary, cursor_file)
        raise RuntimeError("SSH journal stream ended")

if __name__ == "__main__":
    main()
`;

export const LOGIN_NOTIFICATION_UNIT = `[Unit]
Description=SyncReeper SSH login ntfy notifications
Wants=network-online.target
After=network-online.target systemd-journald.service

[Service]
Type=simple
ExecStart=/usr/bin/python3 /usr/local/lib/syncreeper-ssh-login-notification.py
Restart=always
RestartSec=10
StateDirectory=syncreeper-ssh-login-notification
StateDirectoryMode=0700
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`;

export function setupSSHLoginNotification(
    config: pulumi.Output<SSHLoginNotificationConfig>,
    dependsOn: pulumi.Resource[]
): pulumi.Resource[] {
    const script = writeFile({
        name: "ssh-login-notification-script",
        path: "/usr/local/lib/syncreeper-ssh-login-notification.py",
        content: LOGIN_NOTIFICATION_SCRIPT,
        mode: "600",
        dependsOn,
    });
    const settings = writeFile({
        name: "ssh-login-notification-settings",
        path: "/etc/syncreeper-ssh-login-notification.json",
        content: config.apply((value) => JSON.stringify(value)),
        mode: "600",
        dependsOn,
    });
    const unit = writeFile({
        name: "ssh-login-notification-unit",
        path: "/etc/systemd/system/syncreeper-ssh-login-notification.service",
        content: LOGIN_NOTIFICATION_UNIT,
        dependsOn,
    });
    const service = runCommand({
        name: "ssh-login-notification-service",
        create: "systemctl daemon-reload && systemctl enable syncreeper-ssh-login-notification && systemctl restart syncreeper-ssh-login-notification",
        delete: "systemctl disable --now syncreeper-ssh-login-notification",
        // Explicit triggers ensure script/credentials updates restart the watcher.
        environment: {
            SYNCREEPER_NOTIFICATION_SETTINGS_HASH: config.apply((value) =>
                createHash("sha256").update(JSON.stringify(value)).digest("hex")
            ),
            SYNCREEPER_NOTIFICATION_SCRIPT: LOGIN_NOTIFICATION_SCRIPT,
            SYNCREEPER_NOTIFICATION_UNIT: LOGIN_NOTIFICATION_UNIT,
        },
        dependsOn: [script, settings, unit],
    });
    return [script, settings, unit, service];
}
