---
description: "Release notes for all published ng-openapi packages."
---

# Changelog

Release notes for each published package in the ng-openapi workspace.

- [**ng-openapi**](./ng-openapi) — core generator (types + Angular `HttpClient` services)
- [**@ng-openapi/http-resource**](./http-resource) — plugin that emits Angular `httpResource()` calls
- [**@ng-openapi/zod**](./zod) — plugin that emits Zod runtime validators

Each package follows [Conventional Commits](https://www.conventionalcommits.org/)
and is released automatically by
[release-please](https://github.com/googleapis/release-please).

Versions stay on `0.x` until the first major release. Under that policy:

- Breaking changes bump the **minor** version (e.g. `0.2.18 → 0.3.0`).
- New features and bug fixes bump the **patch** version (e.g. `0.2.18 → 0.2.19`).

Tagged releases on GitHub: <https://github.com/ng-openapi/ng-openapi/releases>.
