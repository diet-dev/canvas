import gts from "gts";

export default [
  {ignores: ["dist/**", "dist-demo/**"]},
  ...gts,
  {rules: {quotes: ["warn", "double", {avoidEscape: true}]}},
  {
    files: ["test/**/*.ts"],
    rules: {"@typescript-eslint/no-unused-vars": ["error", {argsIgnorePattern: "^_"}]},
  },
  {
    files: ["test/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [{from: "package", package: "node:test", name: ["describe", "it"]}],
        },
      ],
    },
  },
  {
    files: ["test/types/**/*.ts"],
    rules: {"@typescript-eslint/no-floating-promises": "off"},
  },
];
