# Contributing

```sh
npm install
npm test           # Vitest, including golden fixtures in test/golden/
npm run lint
npm run typecheck
npm run build      # tsup → dist/
npm run dev        # rebuild dist/ on change
```

- `src/` is the pipeline: spec → `resolve()` → backbone → curve (patterns, features) → emitted path data → render (paint, masks, animation) → SVG. `src/react/` is the only React code; a lint rule and a test keep React out of the core.
- **Golden fixtures** (`test/golden/`) pin the exact output for known inputs: the test designs at two sizes, presets, `suggest()` for fixed seeds, and one of every pattern, feature, path, paint and animation. If one fails, generated output changed, which the stability promise treats as a breaking change. Don't update fixtures just to make a test pass; if the change is intended, say so in the changeset.
- Changes that affect the published package need a changeset: `npm run changeset`.
