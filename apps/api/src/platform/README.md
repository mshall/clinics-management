# Platform layer

- `module-contexts.ts` — bounded context registry and allowed dependency edges.
- `module-boundaries.node.test.ts` — CI guard against surprise cross-context coupling.

See [`Docs/MODULAR_MONOLITH.md`](../../../../Docs/MODULAR_MONOLITH.md).

**New `src/<folder>/` module:** add `"<folder>": "<context>"` to `TOP_LEVEL_FOLDER_TO_CONTEXT` in `module-contexts.ts` before push. Cross-context helpers go in `common/`, not `import "../other-context/..."` from clinical/front-office.