import js from "@eslint/js";
import tseslint from "typescript-eslint";

const reactImports = {
  paths: [
    { name: "react", message: "The linescape core must never import React. React code belongs in src/react/." },
    { name: "react-dom", message: "The linescape core must never import React. React code belongs in src/react/." },
  ],
  patterns: [
    { group: ["react/*", "react-dom/*"], message: "The linescape core must never import React. React code belongs in src/react/." },
    { regex: "^\\.{1,2}/(.*/)?react(/|$)", message: "The core must not import from the React entry." },
  ],
};

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Core: everything in the package except the React entry.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/react/**"],
    rules: { "no-restricted-imports": ["error", reactImports] },
  },
);
