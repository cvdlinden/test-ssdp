import js from "@eslint/js";
import globals from "globals";
import markdown from "@eslint/markdown";
import css from "@eslint/css";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // Ignore files and folders...
  {
    ignores: ["package-lock.json", "node_modules/"]
  },
  // Files to lint...
  {
    // Generic JavaScript files
    files: ["**/*.{js,mjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2026
    }
  },
  {
    // Backend-specific JavaScript files
    files: ["index.js", "lib/**/*.js"],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    // Frontend-specific JavaScript files
    files: ["public/js/**/*.js"],
    languageOptions: { globals: { ...globals.browser } }
  },
  {
    // Markdown files
    files: ["**/*.md"],
    plugins: { markdown },
    language: "markdown/gfm",
    extends: ["markdown/recommended"]
  },
  {
    // CSS files
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    extends: ["css/recommended"]
  },
]);
