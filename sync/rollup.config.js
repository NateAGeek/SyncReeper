/**
 * Rollup configuration for bundling the sync application
 *
 * Bundles all source code and dependencies into a single ESM file
 * for deployment to the VPS without needing node_modules.
 */

import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import json from "@rollup/plugin-json";

export default {
    input: "src/index.ts",
    output: {
        file: "dist/bundle.js",
        format: "esm",
        sourcemap: false,
    },
    plugins: [
        // Resolve node_modules dependencies
        resolve({
            preferBuiltins: true,
            exportConditions: ["node"],
        }),
        // Convert CommonJS modules to ES modules
        commonjs(),
        // Handle JSON imports
        json(),
        // Compile TypeScript
        typescript({
            tsconfig: "./tsconfig.json",
            declaration: false,
            declarationMap: false,
        }),
    ],
    // Don't bundle Node.js built-in modules
    external: [
        "node:fs",
        "node:path",
        "node:url",
        "node:http",
        "node:https",
        "node:stream",
        "node:util",
        "node:events",
        "node:buffer",
        "node:crypto",
        "node:os",
        "node:child_process",
        "node:net",
        "node:tls",
        "node:zlib",
        "node:assert",
        "node:async_hooks",
        "fs",
        "path",
        "url",
        "http",
        "https",
        "stream",
        "util",
        "events",
        "buffer",
        "crypto",
        "os",
        "child_process",
        "net",
        "tls",
        "zlib",
        "assert",
        "async_hooks",
    ],
};
