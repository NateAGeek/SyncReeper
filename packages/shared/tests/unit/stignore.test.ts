/**
 * Unit tests for Syncthing .stignore generation and gitignore utilities
 *
 * Tests all functions exported from stignore.ts:
 * - generateStignoreContent(): static template generation
 * - convertGitignoreLine(): single line conversion
 * - convertGitignoreFile(): full file conversion (fs-dependent)
 * - findGitignoreFiles(): repo scanning (fs-dependent)
 * - generateGitignoreSection(): section builder (fs-dependent)
 * - updateStignoreIncludes(): in-place section update (fs-dependent)
 * - regenerateStignore(): full regeneration from scratch (fs-dependent)
 *
 * Uses vi.mock("node:fs") to isolate filesystem interactions.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// Use vi.hoisted so mock functions are available when vi.mock factory runs
const { mockReadFileSync, mockWriteFileSync, mockReaddirSync, mockStatSync, mockExistsSync } =
    vi.hoisted(() => ({
        mockReadFileSync: vi.fn(),
        mockWriteFileSync: vi.fn(),
        mockReaddirSync: vi.fn(),
        mockStatSync: vi.fn(),
        mockExistsSync: vi.fn(),
    }));

vi.mock("node:fs", () => ({
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
    existsSync: mockExistsSync,
}));

import {
    generateStignoreContent,
    GITIGNORE_SECTION_START,
    GITIGNORE_SECTION_END,
    convertGitignoreLine,
    convertGitignoreFile,
    findGitignoreFiles,
    generateGitignoreSection,
    updateStignoreIncludes,
    regenerateStignore,
} from "../../src/stignore";

describe("Stignore Utilities", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ================================================================
    // Constants
    // ================================================================

    describe("GITIGNORE_SECTION_START / GITIGNORE_SECTION_END", () => {
        it("should be non-empty strings", () => {
            expect(GITIGNORE_SECTION_START).toBeTruthy();
            expect(GITIGNORE_SECTION_END).toBeTruthy();
        });

        it("should look like Syncthing comments", () => {
            expect(GITIGNORE_SECTION_START).toMatch(/^\/\//);
            expect(GITIGNORE_SECTION_END).toMatch(/^\/\//);
        });
    });

    // ================================================================
    // generateStignoreContent()
    // ================================================================

    describe("generateStignoreContent()", () => {
        const content = generateStignoreContent();

        it("should produce non-empty content", () => {
            expect(content).toBeTruthy();
            expect(content.length).toBeGreaterThan(100);
        });

        it("should include a descriptive header", () => {
            expect(content).toContain("SyncReeper Syncthing Ignore Patterns");
        });

        it("should include Syncthing docs link", () => {
            expect(content).toContain("https://docs.syncthing.net/users/ignoring.html");
        });

        it("should not have trailing slashes on active patterns", () => {
            const lines = content.split("\n").filter((l) => !l.startsWith("//") && l.trim() !== "");
            const trailingSlashPatterns = lines.filter((l) => l.endsWith("/"));
            expect(trailingSlashPatterns).toEqual([]);
        });

        it("should include gitignore section markers", () => {
            expect(content).toContain(GITIGNORE_SECTION_START);
            expect(content).toContain(GITIGNORE_SECTION_END);
        });

        it("should have start marker before end marker", () => {
            const startIdx = content.indexOf(GITIGNORE_SECTION_START);
            const endIdx = content.indexOf(GITIGNORE_SECTION_END);
            expect(startIdx).toBeLessThan(endIdx);
        });

        // Verify removed patterns stay removed
        it("should NOT contain **/packages (removed for PNPM compatibility)", () => {
            expect(content).not.toContain("**/packages\n");
            // Ensure the pattern doesn't appear as an active line
            const activeLines = content
                .split("\n")
                .filter((l) => !l.startsWith("//") && l.trim() !== "");
            expect(activeLines.find((l) => l.trim() === "**/packages")).toBeUndefined();
        });

        it("should NOT contain **/[Dd]ebug or **/[Rr]elease (removed)", () => {
            const activeLines = content
                .split("\n")
                .filter((l) => !l.startsWith("//") && l.trim() !== "");
            expect(activeLines.find((l) => l.includes("**/[Dd]ebug"))).toBeUndefined();
            expect(activeLines.find((l) => l.includes("**/[Rr]elease"))).toBeUndefined();
        });

        it("should include explanatory comment about omitted C#/.NET patterns", () => {
            expect(content).toContain("omitted");
            expect(content).toContain("PNPM");
        });

        // Cross-reference comments on shared patterns
        it("should have cross-reference comments on shared patterns", () => {
            expect(content).toMatch(/\*\*\/dist\s+\/\/ Also:/);
            expect(content).toMatch(/\*\*\/build\s+\/\/ Also:/);
            expect(content).toMatch(/\*\*\/target\s+\/\/ Also:/);
            expect(content).toMatch(/\*\*\/vendor\s+\/\/ Also:/);
        });

        // Spot check key language patterns
        describe("Language patterns", () => {
            it("should include JS/TS patterns", () => {
                expect(content).toContain("**/node_modules");
                expect(content).toContain("**/.next");
                expect(content).toContain("**/*.tsbuildinfo");
            });

            it("should include Python patterns", () => {
                expect(content).toContain("**/__pycache__");
                expect(content).toContain("**/.venv");
            });

            it("should include Rust patterns", () => {
                expect(content).toContain("**/target");
                expect(content).toContain("**/*.rs.bk");
            });

            it("should include C#/.NET patterns (non-removed ones)", () => {
                expect(content).toContain("**/[Bb]in");
                expect(content).toContain("**/[Oo]bj");
                expect(content).toContain("**/.vs");
            });
        });

        // OS-specific files with (?d) prefix
        describe("OS-specific files", () => {
            it("should use (?d) prefix on macOS junk files", () => {
                expect(content).toContain("(?d)**/.DS_Store");
                expect(content).toContain("(?d)**/.Trashes");
            });

            it("should use (?d) prefix on Windows junk files", () => {
                expect(content).toContain("(?d)**/Thumbs.db");
                expect(content).toContain("(?d)**/desktop.ini");
            });

            it("should use (?d) prefix on log patterns", () => {
                expect(content).toContain("(?d)**/*.log");
                expect(content).toContain("(?d)**/logs");
            });
        });
    });

    // ================================================================
    // convertGitignoreLine()
    // ================================================================

    describe("convertGitignoreLine()", () => {
        const repo = "myorg/myrepo";

        it("should convert a regular pattern to a repo-scoped path", () => {
            expect(convertGitignoreLine("node_modules", repo)).toBe("myorg/myrepo/node_modules");
        });

        it("should preserve empty lines as empty strings", () => {
            expect(convertGitignoreLine("", repo)).toBe("");
            expect(convertGitignoreLine("   ", repo)).toBe("");
        });

        it("should convert comment lines (# -> //)", () => {
            expect(convertGitignoreLine("# Build output", repo)).toBe("// Build output");
        });

        it("should handle comment with no text after #", () => {
            // Template literal `// ${trimmed.slice(1).trim()}` produces "// " for bare "#"
            expect(convertGitignoreLine("#", repo)).toBe("// ");
        });

        it("should handle negation patterns", () => {
            expect(convertGitignoreLine("!important.txt", repo)).toBe(
                "!myorg/myrepo/important.txt"
            );
        });

        it("should strip leading / (root-anchored patterns)", () => {
            expect(convertGitignoreLine("/dist", repo)).toBe("myorg/myrepo/dist");
        });

        it("should strip trailing / (directory indicators)", () => {
            expect(convertGitignoreLine("build/", repo)).toBe("myorg/myrepo/build");
        });

        it("should handle both leading and trailing slashes", () => {
            expect(convertGitignoreLine("/vendor/", repo)).toBe("myorg/myrepo/vendor");
        });

        it("should handle negation with leading slash", () => {
            expect(convertGitignoreLine("!/keep-this/", repo)).toBe("!myorg/myrepo/keep-this");
        });

        it("should handle glob patterns", () => {
            expect(convertGitignoreLine("*.pyc", repo)).toBe("myorg/myrepo/*.pyc");
        });

        it("should handle double-star patterns", () => {
            expect(convertGitignoreLine("**/*.log", repo)).toBe("myorg/myrepo/**/*.log");
        });

        it("should return empty string when pattern reduces to empty", () => {
            // A line that is just "/" after stripping negation+slashes becomes empty
            expect(convertGitignoreLine("/", repo)).toBe("");
        });

        it("should handle whitespace-padded lines by trimming", () => {
            expect(convertGitignoreLine("  dist  ", repo)).toBe("myorg/myrepo/dist");
        });
    });

    // ================================================================
    // convertGitignoreFile()
    // ================================================================

    describe("convertGitignoreFile()", () => {
        it("should read and convert a .gitignore file", () => {
            mockReadFileSync.mockReturnValue("node_modules\ndist\n# Comment\n*.log\n");

            const result = convertGitignoreFile("/repos/org/repo/.gitignore", "org/repo");

            expect(result).toEqual([
                "org/repo/node_modules",
                "org/repo/dist",
                "// Comment",
                "org/repo/*.log",
            ]);
            expect(mockReadFileSync).toHaveBeenCalledWith("/repos/org/repo/.gitignore", "utf-8");
        });

        it("should return null if the file cannot be read", () => {
            mockReadFileSync.mockImplementation(() => {
                throw new Error("ENOENT: no such file");
            });

            const result = convertGitignoreFile("/nonexistent/.gitignore", "org/repo");

            expect(result).toBeNull();
        });

        it("should return null for an empty .gitignore", () => {
            mockReadFileSync.mockReturnValue("");

            const result = convertGitignoreFile("/repos/org/repo/.gitignore", "org/repo");

            expect(result).toBeNull();
        });

        it("should return null for a .gitignore with only blank lines", () => {
            mockReadFileSync.mockReturnValue("\n\n\n");

            const result = convertGitignoreFile("/repos/org/repo/.gitignore", "org/repo");

            expect(result).toBeNull();
        });

        it("should strip trailing blank lines from output", () => {
            mockReadFileSync.mockReturnValue("dist\n\n\n");

            const result = convertGitignoreFile("/repos/org/repo/.gitignore", "org/repo");

            expect(result).toEqual(["org/repo/dist"]);
        });

        it("should preserve internal blank lines", () => {
            mockReadFileSync.mockReturnValue("dist\n\nnode_modules\n");

            const result = convertGitignoreFile("/repos/org/repo/.gitignore", "org/repo");

            expect(result).toEqual(["org/repo/dist", "", "org/repo/node_modules"]);
        });
    });

    // ================================================================
    // findGitignoreFiles()
    // ================================================================

    describe("findGitignoreFiles()", () => {
        function setupDirectoryStructure(
            structure: Record<string, string[]>,
            gitignores: string[]
        ) {
            // readdirSync for the repos root
            const orgs = Object.keys(structure);
            mockReaddirSync.mockImplementation((dirPath: string) => {
                if (dirPath === "/repos") return orgs;
                for (const org of orgs) {
                    if (dirPath === `/repos/${org}`) return structure[org];
                }
                return [];
            });

            // statSync for org dirs and repo dirs
            mockStatSync.mockImplementation((p: string) => {
                // Check if it's an org dir
                for (const org of orgs) {
                    if (p === `/repos/${org}`) return { isDirectory: () => true };
                    for (const repo of structure[org]) {
                        if (p === `/repos/${org}/${repo}`) return { isDirectory: () => true };
                    }
                }
                throw new Error("ENOENT");
            });

            // existsSync for .gitignore files
            mockExistsSync.mockImplementation((p: string) => {
                return gitignores.some((gi) => p === gi);
            });
        }

        it("should find .gitignore files at depth 2 (org/repo)", () => {
            setupDirectoryStructure({ acme: ["frontend", "backend"], other: ["lib"] }, [
                "/repos/acme/frontend/.gitignore",
                "/repos/other/lib/.gitignore",
            ]);

            const results = findGitignoreFiles("/repos");

            expect(results).toEqual([
                { gitignorePath: "/repos/acme/frontend/.gitignore", repoRelPath: "acme/frontend" },
                { gitignorePath: "/repos/other/lib/.gitignore", repoRelPath: "other/lib" },
            ]);
        });

        it("should skip repos without a .gitignore", () => {
            setupDirectoryStructure(
                { acme: ["frontend", "backend"] },
                ["/repos/acme/frontend/.gitignore"] // backend has no .gitignore
            );

            const results = findGitignoreFiles("/repos");

            expect(results).toHaveLength(1);
            expect(results[0].repoRelPath).toBe("acme/frontend");
        });

        it("should return results sorted by repoRelPath", () => {
            setupDirectoryStructure({ zorg: ["app"], acme: ["lib"] }, [
                "/repos/zorg/app/.gitignore",
                "/repos/acme/lib/.gitignore",
            ]);

            const results = findGitignoreFiles("/repos");

            expect(results[0].repoRelPath).toBe("acme/lib");
            expect(results[1].repoRelPath).toBe("zorg/app");
        });

        it("should return empty array if repos dir cannot be read", () => {
            mockReaddirSync.mockImplementation(() => {
                throw new Error("ENOENT");
            });

            const results = findGitignoreFiles("/nonexistent");

            expect(results).toEqual([]);
        });

        it("should return empty array if there are no orgs", () => {
            mockReaddirSync.mockReturnValue([]);

            const results = findGitignoreFiles("/repos");

            expect(results).toEqual([]);
        });

        it("should skip non-directory entries in org dir", () => {
            mockReaddirSync.mockImplementation((dirPath: string) => {
                if (dirPath === "/repos") return ["acme", "README.md"];
                if (dirPath === "/repos/acme") return ["app"];
                return [];
            });
            mockStatSync.mockImplementation((p: string) => {
                if (p === "/repos/acme") return { isDirectory: () => true };
                if (p === "/repos/README.md") return { isDirectory: () => false };
                if (p === "/repos/acme/app") return { isDirectory: () => true };
                throw new Error("ENOENT");
            });
            mockExistsSync.mockReturnValue(true);

            const results = findGitignoreFiles("/repos");

            expect(results).toHaveLength(1);
            expect(results[0].repoRelPath).toBe("acme/app");
        });
    });

    // ================================================================
    // generateGitignoreSection()
    // ================================================================

    describe("generateGitignoreSection()", () => {
        it("should return just markers when no .gitignore files exist", () => {
            mockReaddirSync.mockReturnValue([]);

            const section = generateGitignoreSection("/repos");

            expect(section).toBe(`${GITIGNORE_SECTION_START}\n${GITIGNORE_SECTION_END}`);
        });

        it("should generate section with converted patterns from .gitignore files", () => {
            // Set up one org/repo with a .gitignore
            mockReaddirSync.mockImplementation((dirPath: string) => {
                if (dirPath === "/repos") return ["acme"];
                if (dirPath === "/repos/acme") return ["app"];
                return [];
            });
            mockStatSync.mockImplementation((p: string) => {
                if (p === "/repos/acme" || p === "/repos/acme/app") {
                    return { isDirectory: () => true };
                }
                throw new Error("ENOENT");
            });
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue("node_modules\ndist\n");

            const section = generateGitignoreSection("/repos");

            expect(section).toContain(GITIGNORE_SECTION_START);
            expect(section).toContain(GITIGNORE_SECTION_END);
            expect(section).toContain("// --- acme/app/.gitignore ---");
            expect(section).toContain("acme/app/node_modules");
            expect(section).toContain("acme/app/dist");
        });

        it("should skip repos whose .gitignore converts to empty/null", () => {
            mockReaddirSync.mockImplementation((dirPath: string) => {
                if (dirPath === "/repos") return ["acme"];
                if (dirPath === "/repos/acme") return ["empty-repo"];
                return [];
            });
            mockStatSync.mockImplementation((p: string) => {
                if (p === "/repos/acme" || p === "/repos/acme/empty-repo") {
                    return { isDirectory: () => true };
                }
                throw new Error("ENOENT");
            });
            mockExistsSync.mockReturnValue(true);
            // Empty .gitignore -> convertGitignoreFile returns null
            mockReadFileSync.mockReturnValue("");

            const section = generateGitignoreSection("/repos");

            expect(section).toBe(`${GITIGNORE_SECTION_START}\n${GITIGNORE_SECTION_END}`);
        });
    });

    // ================================================================
    // updateStignoreIncludes()
    // ================================================================

    describe("updateStignoreIncludes()", () => {
        it("should log warning and return if .stignore does not exist", () => {
            mockReadFileSync.mockImplementation(() => {
                throw new Error("ENOENT");
            });
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            updateStignoreIncludes("/repos");

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
            expect(mockWriteFileSync).not.toHaveBeenCalled();
        });

        it("should log warning and return if markers are missing", () => {
            mockReadFileSync.mockReturnValue("// Some stignore without markers\n**/node_modules\n");
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            updateStignoreIncludes("/repos");

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("missing auto-generated section markers")
            );
            expect(mockWriteFileSync).not.toHaveBeenCalled();
        });

        it("should not write if content is unchanged", () => {
            // Set up stignore with empty section, and no repos (so section regenerates identically)
            const existingContent = `// header\n${GITIGNORE_SECTION_START}\n${GITIGNORE_SECTION_END}\n// footer`;
            mockReadFileSync.mockImplementation((filePath: string) => {
                if (filePath === "/repos/.stignore") return existingContent;
                throw new Error("ENOENT");
            });
            mockReaddirSync.mockReturnValue([]);
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            updateStignoreIncludes("/repos");

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("unchanged"));
            expect(mockWriteFileSync).not.toHaveBeenCalled();
        });

        it("should write updated content when gitignore section changes", () => {
            const existingContent = `// header\n${GITIGNORE_SECTION_START}\n${GITIGNORE_SECTION_END}\n`;
            mockReadFileSync.mockImplementation((filePath: string) => {
                if (filePath === "/repos/.stignore") return existingContent;
                if (filePath === "/repos/acme/app/.gitignore") return "dist\n";
                throw new Error("ENOENT");
            });
            mockReaddirSync.mockImplementation((dirPath: string) => {
                if (dirPath === "/repos") return ["acme"];
                if (dirPath === "/repos/acme") return ["app"];
                return [];
            });
            mockStatSync.mockImplementation((p: string) => {
                if (p === "/repos/acme" || p === "/repos/acme/app") {
                    return { isDirectory: () => true };
                }
                throw new Error("ENOENT");
            });
            mockExistsSync.mockReturnValue(true);
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            updateStignoreIncludes("/repos");

            expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
            const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
            expect(writtenContent).toContain("// header");
            expect(writtenContent).toContain("acme/app/dist");
            expect(writtenContent).toContain(GITIGNORE_SECTION_START);
            expect(writtenContent).toContain(GITIGNORE_SECTION_END);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Updated .stignore"));
        });

        it("should log error if write fails", () => {
            const existingContent = `${GITIGNORE_SECTION_START}\n${GITIGNORE_SECTION_END}`;
            // First call reads .stignore, second call is for checking gitignore
            mockReadFileSync.mockImplementation((filePath: string) => {
                if (filePath === "/repos/.stignore") {
                    // On the first read, return existing content
                    // updateStignoreIncludes calls generateGitignoreSection which calls findGitignoreFiles
                    return existingContent;
                }
                if (filePath === "/repos/acme/app/.gitignore") return "dist\n";
                throw new Error("ENOENT");
            });
            mockReaddirSync.mockImplementation((dirPath: string) => {
                if (dirPath === "/repos") return ["acme"];
                if (dirPath === "/repos/acme") return ["app"];
                return [];
            });
            mockStatSync.mockImplementation((p: string) => {
                if (p === "/repos/acme" || p === "/repos/acme/app") {
                    return { isDirectory: () => true };
                }
                throw new Error("ENOENT");
            });
            mockExistsSync.mockReturnValue(true);
            mockWriteFileSync.mockImplementation(() => {
                throw new Error("EACCES: permission denied");
            });
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            vi.spyOn(console, "log").mockImplementation(() => {});

            updateStignoreIncludes("/repos");

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining("Failed to update .stignore")
            );
        });
    });

    // ================================================================
    // regenerateStignore()
    // ================================================================

    describe("regenerateStignore()", () => {
        it("should write the full template and then update gitignore section", () => {
            // First writeFileSync is for the template, second is for updateStignoreIncludes
            mockWriteFileSync.mockImplementation(() => {});

            // When updateStignoreIncludes reads back the file, return the template
            mockReadFileSync.mockImplementation((filePath: string) => {
                if (filePath === "/repos/.stignore") return generateStignoreContent();
                throw new Error("ENOENT");
            });
            mockReaddirSync.mockReturnValue([]); // No repos -> no gitignore changes
            vi.spyOn(console, "log").mockImplementation(() => {});

            regenerateStignore("/repos");

            // First call writes the template
            expect(mockWriteFileSync).toHaveBeenCalledWith(
                "/repos/.stignore",
                expect.stringContaining("SyncReeper Syncthing Ignore Patterns"),
                "utf-8"
            );
        });

        it("should throw if writing the template fails", () => {
            mockWriteFileSync.mockImplementation(() => {
                throw new Error("EACCES: permission denied");
            });

            expect(() => regenerateStignore("/repos")).toThrow("Failed to write .stignore");
        });

        it("should call updateStignoreIncludes after writing the template", () => {
            let writeCount = 0;
            mockWriteFileSync.mockImplementation(() => {
                writeCount++;
            });

            // After the template write, updateStignoreIncludes will read it back
            mockReadFileSync.mockImplementation((filePath: string) => {
                if (filePath === "/repos/.stignore") return generateStignoreContent();
                throw new Error("ENOENT");
            });
            mockReaddirSync.mockReturnValue([]);
            vi.spyOn(console, "log").mockImplementation(() => {});

            regenerateStignore("/repos");

            // At least 1 write for the template (updateStignoreIncludes may skip if unchanged)
            expect(writeCount).toBeGreaterThanOrEqual(1);
        });

        it("should populate gitignore section if repos have .gitignore files", () => {
            const writes: Array<{ path: string; content: string }> = [];
            mockWriteFileSync.mockImplementation((filePath: string, content: string) => {
                writes.push({ path: filePath, content });
            });

            mockReadFileSync.mockImplementation((filePath: string) => {
                if (filePath === "/repos/.stignore") {
                    // Return the latest written content, or the template
                    const lastWrite = writes.filter((w) => w.path === "/repos/.stignore").pop();
                    return lastWrite ? lastWrite.content : generateStignoreContent();
                }
                if (filePath === "/repos/acme/app/.gitignore") return "node_modules\n.env\n";
                throw new Error("ENOENT");
            });
            mockReaddirSync.mockImplementation((dirPath: string) => {
                if (dirPath === "/repos") return ["acme"];
                if (dirPath === "/repos/acme") return ["app"];
                return [];
            });
            mockStatSync.mockImplementation((p: string) => {
                if (p === "/repos/acme" || p === "/repos/acme/app") {
                    return { isDirectory: () => true };
                }
                throw new Error("ENOENT");
            });
            mockExistsSync.mockReturnValue(true);
            vi.spyOn(console, "log").mockImplementation(() => {});

            regenerateStignore("/repos");

            // The second write should contain the gitignore patterns
            expect(writes.length).toBe(2);
            expect(writes[1].content).toContain("acme/app/node_modules");
            expect(writes[1].content).toContain("acme/app/.env");
        });
    });
});
