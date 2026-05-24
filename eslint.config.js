import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettierConfig from "eslint-config-prettier";

export default [
    {
        // Tell ESLint to check all your TypeScript source files
        files: ["**/*.ts"],
        languageOptions: {
            parser: tsParser,
            sourceType: "module",
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
        },
        rules: {
            // Apply standard recommended TypeScript safety rules
            ...tsPlugin.configs.recommended.rules,
            // Turn off formatting rules that might clash with Prettier
            ...prettierConfig.rules,
            // Custom rules for clean audio management
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
        },
    }
];
