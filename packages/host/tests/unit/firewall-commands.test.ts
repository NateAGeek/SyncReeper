/**
 * Unit tests for firewall command generation
 *
 * Tests UFW command generation (Linux) and pf rule generation (macOS).
 */

import { describe, it, expect, vi } from "vitest";

// Mock the command lib to avoid Pulumi resource creation
vi.mock("../../src/lib/command", () => ({
    runCommand: vi.fn(),
    writeFile: vi.fn(),
}));

import { generateRuleCommand, generateFirewallCommands } from "../../src/services/firewall/linux";
import { generatePfRules } from "../../src/services/firewall/darwin";
import type { FirewallRule } from "../../src/services/firewall/types";
import { DEFAULT_FIREWALL_RULES } from "../../src/services/firewall/types";

describe("UFW Command Generation (Linux)", () => {
    describe("generateRuleCommand", () => {
        it("should generate basic allow rule", () => {
            const rule: FirewallRule = {
                description: "Allow HTTP",
                port: "80",
                proto: "tcp",
                action: "allow",
                direction: "in",
            };
            const cmd = generateRuleCommand(rule);

            expect(cmd).toBe('ufw allow in to any port 80 proto tcp comment "Allow HTTP"');
        });

        it("should generate deny rule", () => {
            const rule: FirewallRule = {
                description: "Deny FTP",
                port: "21",
                proto: "tcp",
                action: "deny",
                direction: "in",
            };
            const cmd = generateRuleCommand(rule);

            expect(cmd).toBe('ufw deny in to any port 21 proto tcp comment "Deny FTP"');
        });

        it("should generate rate-limited rule with limit flag", () => {
            const rule: FirewallRule = {
                description: "Allow SSH with rate limiting",
                port: "22",
                proto: "tcp",
                action: "allow",
                direction: "in",
                limit: true,
            };
            const cmd = generateRuleCommand(rule);

            expect(cmd).toBe(
                'ufw limit in to any port 22 proto tcp comment "Allow SSH with rate limiting"'
            );
        });

        it("should not use limit for deny rules even if limit is true", () => {
            const rule: FirewallRule = {
                description: "Deny something",
                port: "8080",
                proto: "tcp",
                action: "deny",
                direction: "in",
                limit: true,
            };
            const cmd = generateRuleCommand(rule);

            // limit only works with allow
            expect(cmd).toContain("ufw deny");
            expect(cmd).not.toContain("limit");
        });

        it("should handle rule with from address", () => {
            const rule: FirewallRule = {
                description: "Allow from subnet",
                port: "443",
                proto: "tcp",
                action: "allow",
                direction: "in",
                from: "192.168.1.0/24",
            };
            const cmd = generateRuleCommand(rule);

            expect(cmd).toContain("from 192.168.1.0/24");
            expect(cmd).toContain("to any port 443");
        });

        it("should handle rule without port", () => {
            const rule: FirewallRule = {
                description: "Allow all outgoing",
                action: "allow",
                direction: "out",
            };
            const cmd = generateRuleCommand(rule);

            expect(cmd).toBe('ufw allow out comment "Allow all outgoing"');
            expect(cmd).not.toContain("port");
        });

        it("should handle rule with proto 'any'", () => {
            const rule: FirewallRule = {
                description: "Allow any proto",
                port: "53",
                proto: "any",
                action: "allow",
                direction: "in",
            };
            const cmd = generateRuleCommand(rule);

            // proto "any" should not add the proto flag
            expect(cmd).not.toContain("proto any");
            expect(cmd).toContain("to any port 53");
        });

        it("should generate correct command for default SSH rule", () => {
            const sshRule = DEFAULT_FIREWALL_RULES[0];
            const cmd = generateRuleCommand(sshRule);

            expect(cmd).toContain("ufw limit in");
            expect(cmd).toContain("port 22");
            expect(cmd).toContain("proto tcp");
        });
    });

    describe("generateFirewallCommands", () => {
        it("should start with UFW reset", () => {
            const commands = generateFirewallCommands([]);

            expect(commands[0]).toBe("echo 'y' | ufw reset");
        });

        it("should set default policies", () => {
            const commands = generateFirewallCommands([]);

            expect(commands).toContain("ufw default deny incoming");
            expect(commands).toContain("ufw default allow outgoing");
        });

        it("should end with UFW enable", () => {
            const commands = generateFirewallCommands([]);

            expect(commands[commands.length - 1]).toBe("echo 'y' | ufw enable");
        });

        it("should include rule commands between policies and enable", () => {
            const rules: FirewallRule[] = [
                {
                    description: "Allow SSH",
                    port: "22",
                    proto: "tcp",
                    action: "allow",
                    direction: "in",
                    limit: true,
                },
                {
                    description: "Allow HTTP",
                    port: "80",
                    proto: "tcp",
                    action: "allow",
                    direction: "in",
                },
            ];
            const commands = generateFirewallCommands(rules);

            // reset, deny incoming, allow outgoing, rule1, rule2, enable
            expect(commands.length).toBe(6);
            expect(commands[3]).toContain("port 22");
            expect(commands[4]).toContain("port 80");
        });

        it("should generate correct commands for default rules", () => {
            const commands = generateFirewallCommands(DEFAULT_FIREWALL_RULES);

            // reset + 2 policies + 1 rule + enable = 5
            expect(commands.length).toBe(5);
            expect(commands[3]).toContain("limit in");
            expect(commands[3]).toContain("port 22");
        });
    });
});

describe("pf Rule Generation (macOS)", () => {
    describe("generatePfRules", () => {
        it("should include SSHGuard table declaration", () => {
            const rules = generatePfRules([]);

            expect(rules).toContain("table <sshguard> persist");
        });

        it("should include SSHGuard block rule", () => {
            const rules = generatePfRules([]);

            expect(rules).toContain(
                "block in quick on egress proto tcp from <sshguard> to any port 22"
            );
        });

        it("should include header comments", () => {
            const rules = generatePfRules([]);

            expect(rules).toContain("# SyncReeper pf firewall rules");
            expect(rules).toContain("# Generated by SyncReeper - do not edit manually");
        });

        it("should convert allow to pass", () => {
            const rules: FirewallRule[] = [
                {
                    description: "Allow SSH",
                    port: "22",
                    proto: "tcp",
                    action: "allow",
                    direction: "in",
                },
            ];
            const output = generatePfRules(rules);

            expect(output).toContain("pass in proto tcp to any port 22");
        });

        it("should convert deny to block", () => {
            const rules: FirewallRule[] = [
                {
                    description: "Deny HTTP",
                    port: "80",
                    proto: "tcp",
                    action: "deny",
                    direction: "in",
                },
            ];
            const output = generatePfRules(rules);

            expect(output).toContain("block in proto tcp to any port 80");
        });

        it("should include rule descriptions as comments", () => {
            const rules: FirewallRule[] = [
                {
                    description: "Allow SSH with rate limiting",
                    port: "22",
                    proto: "tcp",
                    action: "allow",
                    direction: "in",
                },
            ];
            const output = generatePfRules(rules);

            expect(output).toContain("# Allow SSH with rate limiting");
        });

        it("should handle rule with from address", () => {
            const rules: FirewallRule[] = [
                {
                    description: "Allow from subnet",
                    port: "443",
                    proto: "tcp",
                    action: "allow",
                    direction: "in",
                    from: "10.0.0.0/8",
                },
            ];
            const output = generatePfRules(rules);

            expect(output).toContain("from 10.0.0.0/8");
            expect(output).toContain("port 443");
        });

        it("should handle rule without specific protocol", () => {
            const rules: FirewallRule[] = [
                {
                    description: "Allow all incoming",
                    action: "allow",
                    direction: "in",
                    proto: "any",
                },
            ];
            const output = generatePfRules(rules);

            // proto "any" should not add proto keyword
            expect(output).toContain("pass in");
            expect(output).not.toMatch(/pass in proto any/);
        });

        it("should handle default firewall rules", () => {
            const output = generatePfRules(DEFAULT_FIREWALL_RULES);

            expect(output).toContain("pass in proto tcp to any port 22");
            expect(output).toContain("# Allow SSH with rate limiting");
        });
    });
});
