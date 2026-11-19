# Platform layer

- `module-contexts.ts` — bounded context registry and allowed dependency edges.
- `module-boundaries.node.test.ts` — CI guard against surprise cross-context coupling.

See [`Docs/MODULAR_MONOLITH.md`](../../../../Docs/MODULAR_MONOLITH.md).

**New `src/<folder>/` module:** add `"<folder>": "<context>"` to `TOP_LEVEL_FOLDER_TO_CONTEXT` in `module-contexts.ts` before push. Cross-context helpers go in `common/`, not `import "../other-context/..."` from clinical/front-office.

## Application adapters (KX-21 §01)

`adapters/` is the **only** place that may import `@aws-sdk/*` (`secrets.adapter.ts`, `email.adapter.ts`,
`object-storage.s3.adapter.ts`). Callers use `getSecretsAdapter()` / `getEmailAdapter()` / the `UPLOAD_BLOB_STORAGE`
token. `adapters/kx21-aws-sdk-boundary.node.test.ts` fails CI if the SDK is imported anywhere else under `src/`.
`apps/api/docker-entrypoint.mjs` (boot-time `DB_SECRET_ARN` resolution) is outside `src/` and still uses the SDK directly.

