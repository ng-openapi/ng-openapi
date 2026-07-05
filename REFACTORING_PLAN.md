# ng-openapi — Refactoring Plan for 10x Maintainability

> Based on analysis of the graphify knowledge graph (954 nodes, 1596 edges, 76 communities)
> plus direct source review. Date: 2026-07-05.
>
> Evidence sources: `graphify-out/GRAPH_REPORT.md` (god nodes, import cycles, cohesion
> scores) and manual inspection of the hotspot files the graph pointed to.

---

## 1. Current-State Diagnosis

### 1.1 What the knowledge graph says

| Signal | Value | Interpretation |
|---|---|---|
| God node `PathInfo` | 64 edges | Every generator consumes the raw-ish OpenAPI shape directly |
| God node `GeneratorConfig` | 60 edges | The whole config object is passed everywhere; no interface segregation |
| God node `SwaggerParser` | 48 edges | One class is loader + fetcher + format-detector + parser + spec accessor |
| Community "Core Generation Pipeline" cohesion | 0.05 | Weakly interconnected — the pipeline is a bag of loosely coupled classes |
| Community "Service Method Generators" cohesion | 0.06 | Same — generator classes don't share abstractions, they share god nodes |
| Import cycles | 2 cycles through `packages/shared` barrels | `core/index.ts → swagger-parser.ts → types/index.ts → plugin.types.ts → core/index.ts` (and a 5-file variant via `config.types.ts`) |

### 1.2 What direct code review confirms

1. **Import cycles are barrel-driven.** `plugin.types.ts:1` imports `SwaggerParser` from
   `"../core"` (the barrel) as a *runtime* import, though it is only used as a type.
   `swagger-parser.ts:4` imports from `"../types"` (barrel) instead of the concrete files.
2. **Package boundary violation.** `packages/ng-openapi/src/lib/core/generator.ts:16`
   deep-imports `@ng-openapi/shared/src/utils/functions/is-url`, bypassing the package's
   public API (and `isUrl` *is* already exported from the barrel).
3. **`TypeGenerator` is a 581-line multi-responsibility class**
   (`packages/ng-openapi/src/lib/generators/type/type.generator.ts`): enum building,
   union building, interface building, inline-object rendering, `$ref` resolution,
   swagger→TS primitive mapping, name sanitization, three hand-rolled caches, and file
   emission — all in one class.
4. **Large-scale duplication between the core and the http-resource plugin.**
   `service-method-body.generator.ts` and `http-resource-method-body.generator.ts`
   both hand-roll URL construction, path-param substitution, query-param emission,
   custom-header emission, and response-type detection as near-identical string
   templates. A fix in one silently misses the other.
5. **No spec normalization layer.** Swagger 2.0 vs OpenAPI 3.x differences are handled
   ad hoc at every call site (`spec.definitions || spec.components?.schemas`,
   response `content` vs `schema`, etc.). `PathInfo` / `SwaggerDefinition` are
   "raw spec with optionals" rather than a normalized internal model — this is *why*
   they became god nodes.
6. **Test coverage is nearly zero.** Only compile-check tests exist
   (`packages/ng-openapi/tests/compile-check.test.ts`,
   `packages/plugins/http-resource/tests/compile-check.test.ts`);
   `packages/plugins/zod/tests/` is empty. No unit tests for type resolution, enum
   generation, method-body emission, or the parser. Refactoring is currently unsafe.
7. **Weak typing at key seams.** ~64 `any` usages, e.g. `Parameter.schema?: any`,
   `SwaggerResponse.content` schema `any`, `plugins?: (new (...args: any) => IPluginGenerator)[]`
   (the already-defined `IPluginGeneratorClass` isn't used there),
   `buildInterfaceProperties(): any[]`, `getPaths(): Record<string, any>`.
   The *generated* code also contains `const requestOptions: any` and `observe: observe as any`.
8. **Presentation mixed into core logic.** `generateFromConfig()` (`core/generator.ts`)
   does console logging with emojis, error-hint printing, directory creation, and
   orchestration in one function. Libraries that print can't be embedded or tested cleanly
   (30 `console.*` calls across packages).
9. **Fragile micro-optimizations.** `TypeGenerator.resolveSwaggerTypeCached` uses
   `JSON.stringify(schema)` as a cache key — O(schema size) per lookup, and incorrect
   if two schemas differ only by key order semantics. Three caches for what is a
   single-pass generation.
10. **Monorepo tooling underused.** Root scripts chain `npm run build:x && npm run build:y`
    instead of `nx run-many`; no enforced module boundaries; only 2 of 4 packages have
    any test target wired up.

---

## 2. Target Architecture

```
                       ┌─────────────────────────────┐
                       │   CLI (commander)           │  presentation only:
                       │   config load + validation  │  logging, exit codes, hints
                       └──────────────┬──────────────┘
                                      │ GeneratorConfig (validated)
                       ┌──────────────▼──────────────┐
                       │   Orchestrator (pure)       │  returns results, never logs
                       └──────────────┬──────────────┘
                                      │
             ┌────────────────────────▼─────────────────────────┐
             │  Spec Pipeline (packages/shared)                 │
             │  load → parse → normalize → validate             │
             │  output: NormalizedSpec (the ONE internal model) │
             └────────────────────────┬─────────────────────────┘
                                      │ NormalizedSpec / NormalizedOperation
        ┌──────────────┬──────────────┼──────────────────┬─────────────┐
        ▼              ▼              ▼                  ▼             ▼
   TypeGenerator  ServiceGen     Utility gens     http-resource     zod
   (composed of                  (tokens, dates,  plugin            plugin
   small units)                  providers, ...)
        └──────────────┴──────────────┴──────────────────┴─────────────┘
                          all consume shared "emit" helpers
                    (url/query/header/response-type emission lives ONCE)
```

Key ideas:

- **One normalized internal representation (IR).** Swagger 2.0 / OpenAPI 3.x quirks are
  resolved *once* at parse time. Generators never see `$ref`, `definitions` vs
  `components.schemas`, or version differences again. This dissolves the `PathInfo` /
  `SwaggerParser` god nodes by design instead of by decree.
- **Interface segregation for config.** Generators declare the slice of config they need
  (`TypeGenOptions`, `MethodNamingOptions`, …) instead of the whole `GeneratorConfig`.
- **Shared emission layer.** All string-template code fragments used by both the core
  service generator and plugins live in one place in `packages/shared`.
- **Core is pure; CLI presents.** No `console.*` outside the CLI package entry.

---

## 3. Refactoring Phases

Ordering principle: *make the change safe (tests) → make the change easy (structure) →
make the change (features/polish)*. Each step lists Files, Actions, and a Definition of
Done (DoD). Steps within a phase are ordered; phases 4–6 can partially overlap.

---

### Phase 0 — Safety Net (do first; nothing else lands without it)

**Goal: it must be provably safe to refactor.** Current coverage: compile-check only.

#### Step 0.1 — Golden-file (snapshot) test harness
- **Files:** new `packages/testing/src/golden-suite.ts`, fixtures under
  `packages/testing/fixtures/specs/` (small Swagger 2.0 spec, OpenAPI 3.0 spec,
  OpenAPI 3.1 spec, edge-case spec: enums, allOf/oneOf/anyOf, multipart, url-encoded,
  binary responses, nullable, reserved-word property names).
- **Action:** run `generateFromConfig` against each fixture into a temp dir and snapshot
  the full generated output with vitest snapshots. One test per (fixture × relevant
  config permutation): `dateType`, `enumStyle`, `useSingleRequestParameter`,
  `validation.response`, with/without `clientName`.
- **Why first:** golden files freeze today's output. Every structural refactor in later
  phases must produce *byte-identical* output (or an intentionally reviewed snapshot diff).
- **DoD:** `nx run-many -t test` green; snapshot diff on any output change.

#### Step 0.2 — Unit tests for the pure logic that is about to move
- **Files:** `packages/shared/src/**/__tests__/` (or `*.spec.ts` co-located).
- **Action:** cover `SwaggerParser` (format detection, `$ref` resolution, 2.0 vs 3.0
  definitions), `extract-swagger-response-type.ts`, `type.utils.ts`, `string.utils.ts`
  (`camelCase`/`pascalCase` already had a dot-separator bug fixed in #91 — encode that
  as a test), `get-request-body-type.ts`.
- **DoD:** ≥80% line coverage on `packages/shared/src/utils` and `src/core`.

#### Step 0.3 — Wire tests into CI + coverage gate
- **Files:** `.github/workflows/ci.yml`, root `vitest.config.ts`, per-package `project.json`.
- **Action:** add `test` target for all 4 packages (zod currently has an empty `tests/`),
  run via `nx run-many -t test` in CI, upload coverage, set a modest ratchet
  (fail if coverage drops).
- **DoD:** CI runs typecheck + lint + unit + golden suite on every PR.

---

### Phase 1 — Fix Structural Rot in `packages/shared` (small, mechanical, high value)

#### Step 1.1 — Break both import cycles
- **Files:** `packages/shared/src/types/plugin.types.ts`,
  `packages/shared/src/core/swagger-parser.ts`.
- **Action:**
  1. `plugin.types.ts`: change `import { SwaggerParser } from "../core"` to
     `import type { SwaggerParser } from "../core/swagger-parser"` (type-only **and**
     concrete module — either alone breaks the cycle; both is belt-and-braces).
  2. `swagger-parser.ts`: import from the concrete files
     (`../types/config.types`, `../types/swagger.types`) instead of the `../types` barrel.
- **Enforcement:** add `import/no-cycle` (or `@nx/enforce-module-boundaries` +
  `eslint-plugin-import-x`) to `eslint.config.mjs` so cycles can't return.
- **DoD:** `graphify update .` → report shows **0 import cycles**; lint rule active.

#### Step 1.2 — Kill deep imports across package boundaries
- **Files:** `packages/ng-openapi/src/lib/core/generator.ts:16`.
- **Action:** replace `@ng-openapi/shared/src/utils/functions/is-url` with the barrel
  import (`isUrl` is already exported). Add `no-restricted-imports` pattern
  `@ng-openapi/shared/src/*` to eslint.
- **DoD:** grep for `@ng-openapi/shared/src/` returns nothing; lint enforces it.

#### Step 1.3 — Curate the public API of `@ng-openapi/shared`
- **Files:** `packages/shared/src/index.ts` and the four sub-barrels.
- **Action:** replace blanket `export *` chains with explicit named exports, grouped and
  commented (`// spec model`, `// parser`, `// plugin contract`, `// string utils`).
  Everything not exported becomes internal and free to refactor.
- **DoD:** `index.ts` lists every exported symbol explicitly; consumers still compile.

#### Step 1.4 — Type-safety pass on the seams
- **Files:** `packages/shared/src/types/*.ts`, `packages/shared/src/core/swagger-parser.ts`.
- **Action:**
  - `Parameter.schema?: any` → `SwaggerDefinition`.
  - `SwaggerResponse.content` schema `any` → `SwaggerDefinition`.
  - `getPaths(): Record<string, any>` → typed `Record<string, PathItem>`.
  - `GeneratorConfig.plugins?: (new (...args: any) => IPluginGenerator)[]` →
    `IPluginGeneratorClass[]` (it already exists in `plugin.types.ts` — use it, and delete
    the `as IPluginGeneratorClass` cast in `core/generator.ts:115`).
  - `catch (error: any)` in `swagger-parser.ts:55` → `catch (error: unknown)` + narrowing.
  - Enable `@typescript-eslint/no-explicit-any` as `warn` now, `error` after Phase 3.
- **DoD:** `any` count in `packages/shared` is 0; workspace-wide count trending to <10.

---

### Phase 2 — Introduce the Normalized Spec Model (dissolves the god nodes)

This is the single highest-leverage change. The graph shows `PathInfo` (64 edges),
`SwaggerParser` (48) and `SwaggerDefinition` (35) coupling *every* community; the cure is
to make the thing everyone depends on *stable, resolved, and version-free*.

#### Step 2.1 — Split `SwaggerParser` by responsibility
- **Files:** `packages/shared/src/core/` → new files:
  - `spec-loader.ts` — `loadSpecContent(pathOrUrl): Promise<string>` (fs + fetch + timeout).
  - `spec-format.ts` — `detectFormat`, `parseSpecContent` (JSON/YAML).
  - `swagger-parser.ts` — keeps only the spec-access API, constructed from a parsed spec.
- **Action:** pure extraction; `SwaggerParser.create()` remains as a thin façade so all
  48 dependents keep compiling unchanged. Loader/format modules get direct unit tests
  (they're currently only testable through the static façade).
- **DoD:** golden suite byte-identical; new modules unit-tested (incl. URL error paths).

#### Step 2.2 — Define the IR: `NormalizedSpec` / `NormalizedOperation` / `NormalizedSchema`
- **Files:** new `packages/shared/src/model/` (`spec.model.ts`, `operation.model.ts`,
  `schema.model.ts`), new `packages/shared/src/core/normalize.ts`.
- **Action:** `normalize(spec: SwaggerSpec): NormalizedSpec` performed once after parse:
  - resolve version differences (`definitions` vs `components.schemas`, body params vs
    `requestBody`, `produces`/`consumes` vs `content`);
  - resolve all `$ref`s (or attach a resolved lookup) so generators never call
    `parser.resolveReference()` mid-emission (today: `service-method-body.generator.ts:58,74,181,229` …);
  - precompute what every generator recomputes today: `pathParams`, `queryParams`,
    `hasBody`, `isMultipart`, `isUrlEncoded`, `responseType`, sanitized/camelCase names;
  - make required-ness explicit (no `?:` on fields the pipeline guarantees).
  - `NormalizedOperation` **replaces** `PathInfo`; keep `export type PathInfo = NormalizedOperation`
    as a deprecated alias for one release.
- **DoD:** normalizer unit tests cover 2.0 + 3.0 + 3.1 fixtures; `MethodGenerationContext`
  is derived in one place instead of per-generator.

#### Step 2.3 — Migrate generators to the IR, one at a time
- **Order (lowest risk first):** utility generators → `TypeGenerator` → service-method
  chain → http-resource plugin → zod plugin.
- **Action:** each migration is one PR, validated against the golden suite. Delete the
  per-generator re-derivation (`createGenerationContext`, `determineResponseType`,
  content-type sniffing) as each consumer switches.
- **DoD:** `graphify update .` shows `PathInfo`/`SwaggerParser` degree cut roughly in half;
  no generator imports `SwaggerSpec` or touches `$ref`.

#### Step 2.4 — Segregate `GeneratorConfig`
- **Files:** `packages/shared/src/types/config.types.ts` + every generator constructor.
- **Action:** keep `GeneratorConfig` as the user-facing shape, but define narrow internal
  views: `TypeGenOptions` (`dateType`, `enumStyle`, `generateEnumBasedOnDescription`,
  `validation`), `MethodGenOptions` (`customHeaders`, `responseTypeMapping`,
  `customizeMethodName`, `useSingleRequestParameter`), `EmitOptions` (`compilerOptions`,
  `clientName`, `output`). Constructors accept the narrow type — TypeScript's structural
  typing means callers can keep passing the full config.
- **DoD:** no generator constructor takes `GeneratorConfig` directly;
  `GeneratorConfig` god-node degree drops in the graph.

#### Step 2.5 — Validate config at the boundary
- **Files:** new `packages/ng-openapi/src/lib/core/config-validation.ts`, `cli.ts`.
- **Action:** validate the loaded config (zod schema — the workspace already lives in the
  zod ecosystem) before generation: required `input`/`output`, enum values for
  `dateType`/`enumStyle`, function-typed options guarded. Emit actionable messages
  ("`options.dateType` must be 'string' | 'Date', got 'date'").
- **DoD:** malformed config fails fast with a clear error; tests for each rule.

---

### Phase 3 — Decompose the Generator Monoliths & Deduplicate Emission

#### Step 3.1 — Split `TypeGenerator` (581 lines → ~5 focused units)
- **Files:** `packages/ng-openapi/src/lib/generators/type/` →
  - `type-resolver.ts` — `resolveType(schema) → string` (the `resolveSwaggerType*` family,
    `mapSwaggerTypeToTypeScript`, `nullableType`, `getArrayItemType`). Pure, trivially testable.
  - `enum-builder.ts` — `buildEnumAsEnum`, `buildEnumAsUnion`, `buildEnumMembers`, `toEnumKey`.
  - `interface-builder.ts` — `collectInterfaceStructure`, `buildInterfaceProperties`
    (typed as `OptionalKind<PropertySignatureStructure>[]`, not `any[]`), `buildIndexSignatures`.
  - `sdk-types.ts` — `collectSdkTypes` (the `RequestOptions` interface).
  - `type.generator.ts` — thin orchestrator: iterate definitions, delegate, batch-emit.
- **Also:** replace the `JSON.stringify` type-resolution cache with either nothing
  (measure first — batch AST emission was the actual win) or a `WeakMap<SwaggerDefinition, string>`.
- **DoD:** golden suite identical; each unit has direct tests; no file in the folder >200 lines.

#### Step 3.2 — Extract the shared emission layer (kill core↔plugin duplication)
- **Files:** new `packages/shared/src/emit/`:
  - `url.emit.ts` — URL template construction + path-param substitution
    (today duplicated in `service-method-body.generator.ts:96` and
    `http-resource-method-body.generator.ts:32`, with a signal-aware variant).
  - `query-params.emit.ts` — `HttpParamsBuilder` emission (duplicated likewise).
  - `headers.emit.ts` — header init + custom headers + content-type rules.
  - `response-type.emit.ts` — success-status walk + `getResponseTypeFromResponse`.
- **Action:** parameterize the small real differences (e.g. http-resource's
  "value may be a signal → call it" wrapper) instead of forking whole methods.
  Both the core service generator and the http-resource plugin consume these.
- **DoD:** the two body generators contain zero duplicated template logic; a change to
  header emission is a one-file change; golden suites of *both* packages stay green.

#### Step 3.3 — Clean up the generated-code quality
- **Files:** `packages/shared/src/emit/*`, method-body generators.
- **Action:** the generated output itself should be best-practice Angular:
  - eliminate `const requestOptions: any` and `observe: observe as any`
    (type the options object; use `observe` overload types);
  - remove the `as Record<string, string>` TODO in http-resource headers;
  - centralize template indentation (current templates mix 2-space strings inside
    4-space source — a formatting pass via `formatText()` should be the single authority).
- **DoD:** compile-check suite passes with `strict: true` and (new) `noImplicitAny`
  asserted on generated output; TODO removed.

#### Step 3.4 — Purify the orchestrator; move presentation to the CLI
- **Files:** `packages/ng-openapi/src/lib/core/generator.ts`, `cli.ts`,
  new `packages/ng-openapi/src/lib/core/reporter.ts`.
- **Action:**
  - `generateFromConfig` returns a structured `GenerationResult`
    (`{ client, filesWritten, warnings, durationMs }`) and accepts an optional
    `Reporter` interface (`onPhase`, `onWarning`); default is silent.
  - CLI wires a console reporter (emojis live here, and only here) and owns exit codes
    and the URL-error hints currently inlined at `generator.ts:132-145`.
  - Replace `console.warn`/`console.error` in generators (e.g. `type.generator.ts:48,63`)
    with warnings on the result object.
- **DoD:** `grep -r "console\." packages/*/src` matches only the CLI entry; programmatic
  users get a silent, inspectable API.

#### Step 3.5 — Formalize the plugin contract
- **Files:** `packages/shared/src/types/plugin.types.ts`, both plugins.
- **Action:** plugins receive the same narrow inputs as core generators
  (`NormalizedSpec`, their options slice, a `Project`), constructed via
  `IPluginGeneratorClass` (no `any` constructor); document the contract in
  `docs/guide/` so third-party plugins are feasible.
- **DoD:** a plugin can be written against documented types without importing internals.

---

### Phase 4 — Monorepo & Tooling Hygiene

#### Step 4.1 — Use Nx properly
- **Files:** root `package.json`, `nx.json`, per-package `project.json`.
- **Action:** `build` → `nx run-many -t build` (Nx already knows the dependency graph and
  caches); add `typecheck`, `lint`, `test` targets uniformly across the 4 packages;
  define `targetDefaults` with `dependsOn: ["^build"]`.
- **DoD:** `nx run-many -t lint test build` is the single local + CI entrypoint.

#### Step 4.2 — Enforce module boundaries
- **Files:** `eslint.config.mjs`.
- **Action:** enable `@nx/enforce-module-boundaries` with tags
  (`scope:shared`, `scope:core`, `scope:plugin`, `scope:testing`): plugins may depend on
  `shared` only; nothing depends on `testing` except test targets; `shared` depends on
  nothing internal.
- **DoD:** lint fails on a plugin importing from `packages/ng-openapi`.

#### Step 4.3 — Tighten lint & compiler settings
- **Action:** promote `@typescript-eslint/no-explicit-any` to `error`
  (Phases 1–3 removed the bulk); add `no-restricted-imports` for deep shared paths
  (Step 1.2); consider `exactOptionalPropertyTypes` in shared's tsconfig once the IR
  makes required-ness explicit.
- **DoD:** CI enforces; new `any` cannot land silently.

#### Step 4.4 — Keep the knowledge graph honest
- **Action:** per project `CLAUDE.md` rules, run `graphify update .` after each phase and
  record the metrics from GRAPH_REPORT.md in the PR description (god-node degrees,
  cycle count, cohesion). This turns "maintainability" into a tracked number.
- **DoD:** each refactor PR shows the before/after graph metrics (see §5 targets).

---

### Phase 5 — Documentation & Developer Experience (parallel to 3–4)

#### Step 5.1 — Architecture doc for contributors
- **Files:** new `docs/contributing/architecture.md` (or `ARCHITECTURE.md`).
- **Action:** document the pipeline (load → parse → normalize → generate → emit), the IR,
  the emission layer, the plugin contract, and "where does X go" rules. Link it from
  `README.md` and `CLAUDE.md`.

#### Step 5.2 — JSDoc the public API only
- **Action:** every symbol exported from `packages/shared/src/index.ts` and
  `packages/ng-openapi/src/index.ts` gets a JSDoc contract (params, errors thrown,
  version-support notes). Internals stay lean — don't comment mechanics.

#### Step 5.3 — Error message catalogue
- **Action:** collect user-facing errors (config validation, spec load/parse, generation)
  into typed error classes (`SpecLoadError`, `SpecParseError`, `ConfigError`) with stable
  messages; CLI maps them to hints. Tests assert on error *types*, not string matching.

---

### Phase 6 — Optional / Stretch

- **OpenAPI 3.1 first-class support** — the IR (Phase 2) makes this a normalizer-only
  change (JSON-Schema alignment: `type: ["string","null"]` arrays are already
  half-handled in `mapSwaggerTypeToTypeScript`'s default branch — promote to explicit).
- **Property-based tests** for `type-resolver.ts` (random schema → output always compiles).
- **Performance benchmark fixture** (a large real-world spec) run in CI to keep the batch
  AST emission win honest after de-caching (Step 3.1).
- **Publish `@ng-openapi/shared`?** Currently private+bundled (per workspace memory:
  it's an internal bundled dir, not an npm dep — keep it that way unless the plugin
  ecosystem needs the emission layer at runtime).

---

## 4. Suggested PR Sequence (small, reviewable, each independently shippable)

| # | PR | Phase | Risk |
|---|----|-------|------|
| 1 | Golden-file test harness + fixtures | 0.1 | none (test-only) |
| 2 | Unit tests for shared utils/parser | 0.2 | none |
| 3 | CI: test targets for all packages + coverage | 0.3 | none |
| 4 | Break import cycles + lint rule | 1.1 | low |
| 5 | Deep-import fix + restriction rule | 1.2 | low |
| 6 | Explicit public API barrels | 1.3 | low |
| 7 | `any`-removal in shared types | 1.4 | low |
| 8 | Split SwaggerParser (loader/format/access) | 2.1 | low |
| 9 | IR: model + normalizer + tests | 2.2 | medium |
| 10–14 | Migrate generators to IR (one per PR) | 2.3 | medium |
| 15 | Config views (interface segregation) | 2.4 | low |
| 16 | Config validation at CLI boundary | 2.5 | low |
| 17 | TypeGenerator decomposition | 3.1 | medium |
| 18 | Shared emission layer + dedupe core | 3.2 | medium |
| 19 | Migrate http-resource plugin to emission layer | 3.2 | medium |
| 20 | Generated-code quality (`any`-free output) | 3.3 | medium (snapshot diff expected & reviewed) |
| 21 | Pure orchestrator + reporter | 3.4 | low |
| 22 | Plugin contract formalization + docs | 3.5 | low |
| 23 | Nx targets + boundaries + lint ratchet | 4 | low |
| 24 | Architecture docs + JSDoc + error catalogue | 5 | none |

Rules of engagement:
- Golden suite must pass **byte-identical** for every structural PR (4–19, 21–23).
  PR 20 is the only one allowed to change generated output, and its snapshot diff is
  the review artifact.
- Run `graphify update .` after merge of each phase; paste metric deltas into the PR.
- Conventional commits (release-please is wired to them); no PR mixes phases.

---

## 5. Measurable Success Criteria ("10x" made concrete)

| Metric | Today | Target |
|---|---|---|
| Import cycles (graphify) | 2 | 0 |
| `PathInfo` god-node degree | 64 | < 25 (IR consumed via narrow contexts) |
| `GeneratorConfig` degree | 60 | < 20 (segregated option views) |
| `SwaggerParser` degree | 48 | < 15 (generators consume `NormalizedSpec`) |
| `any` occurrences in source | ~64 | < 5 (lint-enforced) |
| Unit/golden test files | 2 compile-checks | every package tested; shared ≥80% cov |
| Largest source file | 581 lines | < 250 lines |
| Duplicated emission logic (core vs http-resource) | ~5 method families | 0 (shared emit layer) |
| `console.*` outside CLI | ~30 | 0 |
| Spec-version conditionals inside generators | many | 0 (normalizer only) |
| "Core Generation Pipeline" cohesion | 0.05 | trending up after IR + emission layer |

---

## 6. Risks & Mitigations

- **Snapshot churn hides regressions** → keep fixtures small and focused; one behavioral
  change per PR; treat any unexplained snapshot diff as a blocker.
- **IR misses a spec quirk** (e.g. exotic `$ref` targets, parameter `$ref`s) → normalizer
  throws a typed `SpecParseError` on constructs it doesn't understand rather than
  silently emitting `any`; add the fixture, then support it.
- **Plugin API breakage for external users** → keep `PathInfo`/`SwaggerParser` exports as
  deprecated aliases for one minor release; document migration in the changelog
  (release-please picks it up from commit messages).
- **Performance regressions after de-caching** → Phase 6 benchmark fixture; only remove
  a cache after measuring it's dead weight.
