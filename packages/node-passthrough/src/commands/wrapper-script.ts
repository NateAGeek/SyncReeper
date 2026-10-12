/**
 * Wrapper script generator for the passthrough tunnel watchdog
 *
 * Generates a bash script that wraps autossh with:
 *   - Periodic health probing (verifies the reverse tunnel port is actually
 *     bound on the VPS by testing the full round-trip through the tunnel)
 *   - Automatic restart of autossh after consecutive probe failures
 *   - Structured JSON-line event logging for monitoring and diagnostics
 *
 * The generated script is installed to /usr/local/bin and invoked by the
 * LaunchDaemon plist instead of calling autossh directly.
 */

import type { PassthroughClientConfig } from "../config.js";
import { getHealthLogPath } from "../config.js";

/**
 * Generates the watchdog wrapper bash script.
 *
 * Health probe strategy:
 *   Opens a temporary SSH local port forward (-L) through the VPS using the
 *   passthrough key, mapping a random high local port to localhost:<tunnelPort>
 *   on the VPS. Then probes the local port with nc. If the tunnel is working,
 *   the connection traverses: local port → VPS tunnel port → reverse tunnel →
 *   client SSH, confirming end-to-end tunnel health.
 */
export function generateWrapperScript(
    config: PassthroughClientConfig,
    autosshPath: string
): string {
    const healthLog = getHealthLogPath();
    const probeLocalPort = 10000 + (config.tunnelPort % 50000);

    return `#!/usr/bin/env bash
#
# SyncReeper Passthrough Tunnel Watchdog
# Managed by syncreeper-passthrough — do not edit manually
#
# Wraps autossh with periodic tunnel health probing and structured event logging.
# If the health probe fails ${HEALTH_MAX_FAILURES} consecutive times, autossh is killed and restarted.
#
# Health probe: opens a temporary SSH local forward to the VPS tunnel port,
# then verifies connectivity with nc. This tests the full round-trip:
#   client → VPS SSH → VPS tunnel port → reverse tunnel → client SSH
#

set -uo pipefail

# ── Configuration ──────────────────────────────────────────────────────
AUTOSSH="${autosshPath}"
VPS_ADDRESS="${config.vpsAddress}"
VPS_PORT="${config.vpsPort}"
TUNNEL_PORT="${config.tunnelPort}"
KEY_PATH="${config.keyPath}"
TUNNEL_USER="${config.tunnelUser}"
HEALTH_LOG="${healthLog}"

HEALTH_INTERVAL=60
HEALTH_MAX_FAILURES=3
HEALTH_TIMEOUT=15
PROBE_PORT=${probeLocalPort}

# ── State ──────────────────────────────────────────────────────────────
AUTOSSH_PID=""
HEALTH_PID=""
CONSECUTIVE_FAILURES=0
RUNNING=true
RESTART_COUNT=0

# ── Helpers ────────────────────────────────────────────────────────────
log_event() {
    local event="$1"
    local status="$2"
    local detail="\${3:-}"
    printf '{"ts":"%s","event":"%s","status":"%s","restarts":%d,"detail":"%s"}\\n' \\
        "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\
        "$event" \\
        "$status" \\
        "$RESTART_COUNT" \\
        "$detail" \\
        >> "$HEALTH_LOG"
}

cleanup() {
    RUNNING=false
    [[ -n "$HEALTH_PID" ]] && kill "$HEALTH_PID" 2>/dev/null
    [[ -n "$AUTOSSH_PID" ]] && kill "$AUTOSSH_PID" 2>/dev/null
    wait 2>/dev/null
    log_event "tunnel_stop" "ok" "watchdog shutting down"
    exit 0
}

trap cleanup SIGTERM SIGINT SIGHUP

# ── Autossh management ────────────────────────────────────────────────
start_autossh() {
    "$AUTOSSH" \\
        -M 0 \\
        -N \\
        -o ServerAliveInterval=30 \\
        -o ServerAliveCountMax=3 \\
        -o ExitOnForwardFailure=yes \\
        -o StrictHostKeyChecking=accept-new \\
        -i "$KEY_PATH" \\
        -R "$TUNNEL_PORT:localhost:22" \\
        -p "$VPS_PORT" \\
        "$TUNNEL_USER@$VPS_ADDRESS" &
    AUTOSSH_PID=$!
    log_event "tunnel_start" "ok" "autossh pid=$AUTOSSH_PID"
}

# ── Health probe ───────────────────────────────────────────────────────
#
# Opens a temporary SSH local forward:
#   localhost:$PROBE_PORT → (via VPS SSH) → VPS localhost:$TUNNEL_PORT
#
# Then probes localhost:$PROBE_PORT with nc. If the reverse tunnel is
# healthy, the VPS tunnel port is bound and forwarding traffic back
# through the reverse tunnel to the client's SSH server.
#
check_tunnel_health() {
    ssh -N \\
        -o ConnectTimeout=10 \\
        -o ServerAliveInterval=5 \\
        -o ServerAliveCountMax=1 \\
        -o ExitOnForwardFailure=yes \\
        -o StrictHostKeyChecking=accept-new \\
        -i "$KEY_PATH" \\
        -p "$VPS_PORT" \\
        -L "$PROBE_PORT:localhost:$TUNNEL_PORT" \\
        "$TUNNEL_USER@$VPS_ADDRESS" &>/dev/null &
    local probe_ssh_pid=$!

    sleep 3

    if ! kill -0 "$probe_ssh_pid" 2>/dev/null; then
        return 1
    fi

    local result=1
    if nc -z -w 5 localhost "$PROBE_PORT" 2>/dev/null; then
        result=0
    fi

    kill "$probe_ssh_pid" 2>/dev/null
    wait "$probe_ssh_pid" 2>/dev/null
    return $result
}

# ── Health check loop ──────────────────────────────────────────────────
health_loop() {
    sleep 30

    while $RUNNING; do
        if [[ -z "$AUTOSSH_PID" ]] || ! kill -0 "$AUTOSSH_PID" 2>/dev/null; then
            log_event "process_check" "warn" "autossh not running, waiting for launchd restart"
            sleep "$HEALTH_INTERVAL"
            continue
        fi

        if check_tunnel_health; then
            CONSECUTIVE_FAILURES=0
            log_event "health_check" "ok" "tunnel healthy"
        else
            CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
            log_event "health_check" "fail" \\
                "probe failed (consecutive=$CONSECUTIVE_FAILURES/$HEALTH_MAX_FAILURES)"

            if [[ $CONSECUTIVE_FAILURES -ge $HEALTH_MAX_FAILURES ]]; then
                log_event "tunnel_restart" "warn" \\
                    "killing autossh after $CONSECUTIVE_FAILURES consecutive failures"
                kill "$AUTOSSH_PID" 2>/dev/null
                wait "$AUTOSSH_PID" 2>/dev/null
                CONSECUTIVE_FAILURES=0
                RESTART_COUNT=$((RESTART_COUNT + 1))
                sleep 5
                start_autossh
            fi
        fi

        sleep "$HEALTH_INTERVAL"
    done
}

# ── Main ───────────────────────────────────────────────────────────────
log_event "watchdog_start" "ok" "interval=${HEALTH_INTERVAL}s max_failures=${HEALTH_MAX_FAILURES}"

start_autossh
health_loop &
HEALTH_PID=$!

while $RUNNING; do
    wait "$AUTOSSH_PID" 2>/dev/null
    if $RUNNING; then
        log_event "autossh_exit" "warn" "autossh exited, restarting in 5s"
        RESTART_COUNT=$((RESTART_COUNT + 1))
        sleep 5
        $RUNNING && start_autossh
    fi
done
`;
}

/**
 * Health check interval in seconds (exported for status display)
 */
export const HEALTH_INTERVAL = 60;

/**
 * Max consecutive failures before restart (exported for status display)
 */
export const HEALTH_MAX_FAILURES = 3;
