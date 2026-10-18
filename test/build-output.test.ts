import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Checks the built dist/, so it only runs after `npm run build`.
const dist = join(import.meta.dirname, "..", "dist");
const built = existsSync(join(dist, "react.js"));

describe.skipIf(!built)("build output", () => {
  it.each(["react.js", "react.cjs"])("%s starts with a single \"use client\"", (file) => {
    const code = readFileSync(join(dist, file), "utf8");
    // Must be in the directive prologue; CJS output puts "use strict" first, which is fine.
    expect(code).toMatch(/^("use strict";\s*)?"use client";/);
    expect(code.match(/"use client"/g)).toHaveLength(1);
  });

  it.each(["react.js", "react.cjs"])("%s imports the core instead of bundling a copy", (file) => {
    const code = readFileSync(join(dist, file), "utf8");
    expect(code).toMatch(/from "linescape"|require\("linescape"\)/);
    expect(code).not.toContain("function render(");
  });

  it.each(["index.js", "index.cjs"])("%s has no \"use client\" and no React import", (file) => {
    const code = readFileSync(join(dist, file), "utf8");
    expect(code).not.toContain("use client");
    expect(code).not.toMatch(/["']react(-dom)?["']/);
  });
});
