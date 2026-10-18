import { defineConfig, type Options } from "tsup";

const shared: Options = {
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  target: "es2020",
  external: ["react", "react-dom"],
};

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/index.ts" },
    clean: true,
  },
  {
    ...shared,
    // "use client" in the source is preserved by tsup 9; test/build-output.test.ts guards it.
    entry: { react: "src/react/index.tsx" },
    // The React entry imports the core as "linescape" (tsconfig paths map it to src/ for tests and
    // types). Keeping it external makes dist/react.* import the installed core instead of bundling
    // a second copy of it.
    external: [...shared.external!, "linescape"],
  },
]);
