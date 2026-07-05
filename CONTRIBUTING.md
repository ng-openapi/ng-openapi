# Contributing to ng-openapi

Thanks for contributing! This guide covers local setup and the test suites you'll
interact with most.

## Setup

```bash
npm ci
```

## Building

```bash
npm run build          # builds ng-openapi, http-resource, and zod
```

## Testing

The suite is [Vitest](https://vitest.dev)-based and splits into three kinds of tests:

```bash
npm test               # run everything once
npm run test:watch     # watch mode
npm run test:coverage  # run with coverage (packages/shared is the main target)
```

### Unit tests

Fast, network-free tests for `@ng-openapi/shared` (string/type utils, response-type
inference, `extractPaths`, `SwaggerParser`). No configuration needed.

### Golden-file tests

`registerGoldenSuite` generates code from the checked-in spec fixtures in
`packages/testing/fixtures/specs/` and compares every generated file against a
committed snapshot under `packages/**/tests/__golden__/`. Structural refactors must
keep these snapshots **byte-identical** — an intentional output change shows up as a
reviewable `.ts` diff.

When you deliberately change generator output, regenerate the snapshots and commit them:

```bash
npm test -- -u        # update golden snapshots (-u = --update)
```

Then review the resulting `__golden__` diff carefully — it *is* the change under review.

> Golden snapshots and fixtures are pinned to LF via `.gitattributes`. Don't override
> `core.autocrlf` in a way that rewrites them, or byte-for-byte comparison will break.

### Compile-check tests

These generate code from **live** OpenAPI specs and type-check the output with the
TypeScript compiler. They read the spec locations from environment variables and
**skip automatically when the variables are unset**, so the rest of the suite still runs
offline.

Set these three variables to run them locally:

| Variable                | Spec              | URL                                                            |
| ----------------------- | ----------------- | -------------------------------------------------------------- |
| `OPENAPI_SPEC_V2_URL`   | Swagger 2.0       | https://ng-openapi.github.io/openapi-spec/specs/v2-swagger.yaml   |
| `OPENAPI_SPEC_V3_URL`   | OpenAPI 3.0       | https://ng-openapi.github.io/openapi-spec/specs/v3.0-openapi.yaml |
| `OPENAPI_SPEC_V3_1_URL` | OpenAPI 3.1       | https://ng-openapi.github.io/openapi-spec/specs/v3.1-openapi.yaml |

**bash / zsh:**

```bash
export OPENAPI_SPEC_V2_URL=https://ng-openapi.github.io/openapi-spec/specs/v2-swagger.yaml
export OPENAPI_SPEC_V3_URL=https://ng-openapi.github.io/openapi-spec/specs/v3.0-openapi.yaml
export OPENAPI_SPEC_V3_1_URL=https://ng-openapi.github.io/openapi-spec/specs/v3.1-openapi.yaml
npm test
```

**PowerShell:**

```powershell
$env:OPENAPI_SPEC_V2_URL   = "https://ng-openapi.github.io/openapi-spec/specs/v2-swagger.yaml"
$env:OPENAPI_SPEC_V3_URL   = "https://ng-openapi.github.io/openapi-spec/specs/v3.0-openapi.yaml"
$env:OPENAPI_SPEC_V3_1_URL = "https://ng-openapi.github.io/openapi-spec/specs/v3.1-openapi.yaml"
npm test
```

In CI these are provided as repository variables (`vars.*`), so the compile-checks run
on every pull request without any per-fork setup.

## Pull requests

- Follow the [Conventional Commits](https://www.conventionalcommits.org) format for PR
  titles (e.g. `feat(ng-openapi): ...`, `fix(shared): ...`, `chore(testing): ...`) — the
  title is validated by CI.
- Run `npm test` before pushing; include updated golden snapshots when output changes.
- Fill out the pull request template.
