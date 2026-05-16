<!--
Thanks for contributing to ng-openapi!

Your PR title MUST follow Conventional Commits format — it becomes the squash-merge commit message and the changelog entry. The CI will fail otherwise.

  <type>(<scope>): <short description>

Allowed types:
  feat      → new feature (patch bump pre-1.0)
  fix       → bug fix (patch bump pre-1.0)
  perf      → performance improvement
  deps      → dependency update
  revert    → revert a previous commit
  docs      → documentation only (no release)
  refactor  → internal refactor (no release)
  test      → tests only (no release)
  build     → build system / tooling (no release)
  ci        → CI config (no release)
  chore     → other maintenance (no release)
  style     → formatting only (no release)

Add ! before the colon for breaking changes (minor bump pre-1.0):
  feat(generator)!: rename `customizeMethodName` option

Scopes (use one when relevant):
  ng-openapi, http-resource, zod, generator, file-download.generator, ci, deps, ...

Examples:
  fix(file-download.generator): handle undefined under strict typings
  feat(zod): emit discriminated unions for oneOf with discriminator
  perf(generator): cache resolved $refs across operations
-->

## Summary

<!-- 1–3 bullets on what changed and why. Link the issue if there is one (Closes #123). -->

-

## How to verify

<!-- Steps a reviewer can run locally, or a description of what to look for in the generated output. -->

-

## Checklist

- [ ] PR title follows Conventional Commits (see comment above)
- [ ] Updated docs under `docs/` if user-facing behavior changed
- [ ] Tested locally against a representative OpenAPI spec
