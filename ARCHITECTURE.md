# ng-openapi — Architecture

> Contributor-facing overview. For user documentation see https://ng-openapi.dev;
> for setup and test workflows see [CONTRIBUTING.md](CONTRIBUTING.md).

## The pipeline

Every generation run flows through the same stages:

```
   load ─────────► parse ─────────► normalize ─────────► generate ─────────► emit
   spec-loader     spec-format      normalize.ts          generators          ts-morph Project
   (fs / http)     (JSON / YAML)    → NormalizedSpec      (core + plugins)    formatText() + save
```

- **Load** (`packages/shared/src/core/spec-loader.ts`) — raw content from a file
  or URL. Pure I/O; throws `SpecLoadError`.
- **Parse** (`spec-format.ts`) — format detection + JSON/YAML parsing into a raw
  `SwaggerSpec`. Pure functions; throws `SpecParseError`.
- **Normalize** (`normalize.ts`) — resolves *every* Swagger 2.0 vs OpenAPI 3.x
  difference exactly once and precomputes what generators would otherwise
  re-derive (`pathParams`, `queryParams`, `hasBody`, `isMultipart`,
  `responseType`, resolved `$ref`s, …). Output: **`NormalizedSpec`** /
  **`NormalizedOperation`** — the one internal model (the "IR").
- **Generate** — each generator turns the IR into ts-morph structures. The
  orchestrator (`packages/ng-openapi/src/lib/core/generator.ts`) sequences them
  and stays pure: no logging, results returned as `GenerationResult`, progress
  via the optional `Reporter`.
- **Emit** — everything is written through one shared ts-morph `Project`;
  `formatText()` is the single authority for generated-code layout (templates
  never hand-roll indentation).

## Package layout and boundaries

Boundaries are enforced by `@nx/enforce-module-boundaries` (scope tags, see
`eslint.config.mjs`); a violation fails lint.

| Package | Tag | May depend on |
|---|---|---|
| `packages/shared` | `scope:shared` | nothing internal |
| `packages/ng-openapi` | `scope:core` | shared |
| `packages/plugins/*` | `scope:plugin` | shared |
| `packages/testing` | `scope:testing` | everything |

`@ng-openapi/shared` is **bundled, not published**: tsup inlines its sources
into each publishable package. Its public API is the explicit export list in
`packages/shared/src/index.ts` — anything not exported there is internal and
free to change.

## Key design decisions

### One normalized model (IR)

Generators never see `definitions` vs `components.schemas`, body parameters vs
`requestBody`, or raw `$ref`s — the normalizer already handled them. If a
generator needs a new per-operation fact, **add it to `NormalizedOperation` in
the normalizer**, don't re-derive it at the call site.

### Shared emission layer

All string-template fragments used by more than one method-body generator live
in `packages/shared/src/emit/` (URL construction, query params, headers,
request-option entries). The http-resource plugin's signal-aware reads are a
parameter of these helpers, not a fork. A change to, say, header emission is a
one-file change.

### Segregated config views

`GeneratorConfig` is the user-facing shape; generators declare the slice they
consume (`TypeGenOptions`, `MethodGenOptions`, `TypeMappingConfig`, …).
TypeScript's structural typing lets callers keep passing the full config.
Only the CLI/orchestrator boundary and the plugin contract see all of it.

### Pure core, presenting CLI

`generateFromConfig()` returns `{ client, filesWritten, warnings, durationMs }`
and accepts a `Reporter` (`onPhase`, `onWarning`); it never logs. `console.*`
exists **only** in `cli.ts` — this is asserted culturally and by grep, and it is
what keeps the library embeddable and testable.

### Typed errors

User-facing failures are typed (`packages/shared/src/errors.ts`):
`SpecLoadError` (input unreadable), `SpecParseError` (content unusable),
`ConfigValidationError` (invalid config, collects all issues). Hosts branch on
`instanceof`, never on message text — messages are presentation.

### Plugin contract

Plugins are classes constructed with a single `PluginGeneratorContext`
(`{ spec, project, config, onWarning }`) and implement
`generate(outputRoot)`. They get the same treatment as core generators:
IR in, files out through the shared project, warnings through the sink.
Documented for third parties in `docs/guide/plugin-authoring.md`.

### Project as the manifest

The shared ts-morph `Project` is the source of truth for what a run generated.
Index generators derive their export lists from it
(`listGeneratedFileNames()` in `packages/shared/src/utils/project.utils.ts`),
never from `fs.readdirSync` on the output tree: the filesystem may hold stale
files from earlier runs, and a path-less spec legitimately generates no
`services/` directory at all. The corollary: a generator that decides not to
emit a file must remove it from the Project rather than leave it unsaved —
otherwise it would show up in indexes and `filesWritten`.

## Safety nets

- **Golden suite** — every generated file from 5 spec fixtures × config
  variants is snapshot-compared byte-for-byte. Structural refactors must keep
  them identical; intentional output changes are the review artifact.
- **Compile-check suite** — generates from live/local specs and type-checks the
  output with `strict` + `noImplicitAny`, after stripping the shipped
  `@ts-nocheck` pragma. The generated code is provably strict-clean.
- **Unit tests** — parser/normalizer/emitters/type units directly.
- **Knowledge graph** — `graphify update .` after structural changes; god-node
  degrees and cycle counts are tracked in PRs.

## Where does X go?

| You're adding… | It goes… |
|---|---|
| A new per-operation derived fact | `normalize.ts` + `NormalizedOperation` |
| A code fragment used by ≥2 generators | `packages/shared/src/emit/` |
| A new generator option | `GeneratorConfig` + the narrow view that consumes it + `config-validation.ts` |
| A new output file kind for the core | a generator under `packages/ng-openapi/src/lib/generators/` |
| An alternative client flavor | a plugin package implementing `PluginGeneratorContext` |
| A new user-facing failure mode | a typed error in `packages/shared/src/errors.ts` (or extend an existing one) |
| A string/name helper | `packages/shared/src/utils/` — and export it from the barrel only if consumers outside shared need it |
| Console output | `cli.ts`. Nowhere else. |
