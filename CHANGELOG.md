# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-04-22

### Added

- M1 scaffold: repo layout, TypeScript/Vitest/Playwright/esbuild configs, empty `FMOData` class, placeholder failing unit test.
- M2 query + URL layer:
  - `src/url.ts`: `escapeStringLiteral`, `formatDateTime`, `parseDateTime`, `formatLiteral`, `encodePathSegment`, `buildQueryString`.
  - `src/query.ts`: `Query` fluent builder (`select`, `filter`, `or`, `expand`, `orderby`, `top`, `skip`, `count`, `search`, `toURL`), `Filter` class, `filterFactory`.
  - `FMOData#from(entitySet)` returns a `Query`.
  - Public exports: `Query`, `Filter`, `filterFactory`, `FilterFactory`, `FilterInput`, `OrderDir`, `ODataLiteral`.
  - 62 passing unit tests covering every builder path and URL edge case.
  - Minified bundle ~4.2 KB raw / ~1.55 KB gzipped.
- Dev tooling:
  - `.env.sample` / `.env` for local FMS config; `.env` is git-ignored.
  - `scripts/env.mjs`, `scripts/insecure-fetch.mjs`, `scripts/probe.mjs`.
  - `npm run probe` validates connectivity, auth, and the `Contacts` schema against a live FMS.
  - `FM_ODATA_INSECURE_TLS=1` toggles `NODE_TLS_REJECT_UNAUTHORIZED=0` for dev use with self-signed certs.
- `docs/filemaker-quirks.md` documenting: Basic-auth-only on OData, `/$count` returning 400, self-signed cert handling.
- M3 CRUD + auth + errors:
  - `src/http.ts`: shared request executor — `resolveAuthHeader` (Basic/Bearer auto-detect), `basicAuth(user, pass)` helper, `combineSignals`, `executeRequest`, `executeJson`.
  - `src/errors.ts`: `parseErrorResponse` handling OData JSON envelope + FileMaker XML envelope.
  - `src/entity.ts`: `EntityRef` with `.get()`, `.patch()` (with `ifMatch`, `returnRepresentation`), `.delete()`.
  - `Query#create()` (POST), `Query#get()` returning `{ value, count?, nextLink? }`, `Query#byKey(key)` returning `EntityRef`.
  - `FMOData#request()` / `FMOData#rawRequest()` low-level escape hatches.
  - 401 retry via `onUnauthorized` (once), `AbortSignal` + `timeoutMs` composition.
  - 100 passing unit tests (mocked fetch); 3 passing live-integration tests against the `Contacts` DB covering read, full CRUD round-trip, and error handling.
  - Opt-in live suite: `FM_ODATA_LIVE=1 npm test -- tests/integration`.
  - Bundle now ~8.8 KB raw / ~3.2 KB gzipped.
