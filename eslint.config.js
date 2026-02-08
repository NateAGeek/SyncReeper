import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
    // Global ignores
    {
        ignores: [
            "dist/**",
            "packages/*/dist/**",
            "node_modules/**",
            "packages/*/node_modules/**",
            "test-repos/**",
        ],
    },

    // Base ESLint recommended rules
    eslint.configs.recommended,

    // TypeScript ESLint recommended rules
    ...tseslint.configs.recommended,

    // Prettier compatibility (disables conflicting rules)
    eslintConfigPrettier,

    // Global settings for all files
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
            },
        },
    },

    // TypeScript-specific settings for all packages
    {
        files: ["packages/*/src/**/*.ts"],
        rules: {
            // TypeScript-specific rules
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                },
            ],
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/consistent-type-imports": [
                "error",
                {
                    prefer: "type-imports",
                    fixStyle: "inline-type-imports",
                },
            ],

            // General code quality
            "no-console": "off", // We use console for CLI output
            eqeqeq: ["error", "always"],
            "no-var": "error",
            "prefer-const": "error",
        },
    }
);
