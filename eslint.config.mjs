import tsParser from "@typescript-eslint/parser";

export default [
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**", "**/.expo/**", "**/.turbo/**", "**/coverage/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tsParser,
    },
  },
];
