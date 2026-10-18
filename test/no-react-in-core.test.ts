import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = join(import.meta.dirname, "..", "src");
const reactDir = join(srcDir, "react");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return path === reactDir ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const importPattern = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']([^"']+)["']/g;

describe("core stays React-free", () => {
  const files = sourceFiles(srcDir);

  it("finds core source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [relative(srcDir, f), f]))("%s imports no React", (_name, file) => {
    const specifiers = [...readFileSync(file, "utf8").matchAll(importPattern)].map((m) => m[1]!);
    const offending = specifiers.filter((s) => /^react(-dom)?(\/|$)/.test(s) || /(^|\/)react(\/|$)/.test(s));
    expect(offending).toEqual([]);
  });

  it("core has no dependencies", async () => {
    const pkg = JSON.parse(readFileSync(join(srcDir, "..", "package.json"), "utf8"));
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});
