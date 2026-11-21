# Changelog

## [0.3.0](https://github.com/ng-openapi/ng-openapi/compare/http-resource-v0.2.0...http-resource-v0.3.0) (2026-11-21)


### ⚠ BREAKING CHANGES

* **generator:** an operation that declares both multipart/form-data and application/x-www-form-urlencoded no longer takes arguments for fields that only the urlencoded form lists. Generated methods have always sent the multipart body, so these arguments were accepted and never sent; generation now warns about each such field. Regenerate and remove the argument from callers. Review positional calls by hand: the parameters after a removed field move up by one, so a call still compiles when the next parameter has the same type, with the value now sent in its place — `upload(file, "my note")` against `(file, note?, tag?)` becomes a call to `(file, tag?)` and sends `?tag=my%20note`. Operations whose two forms list the same fields keep their signature.
* **generator:** a request body declared on a GET or HEAD operation is no longer generated. The method loses its body argument and no longer sets `Content-Type: application/json`; the body itself was never sent. With `useSingleRequestParameter`, `<Operation>Params` loses the body property, and when the body was the operation's only input the interface is no longer generated and the method loses its `request` argument, so imports of that interface break. The zod plugin no longer generates the `<operation>Body` validator or its `<Operation>Body` type for these operations. Regenerate and remove the argument from callers. Review positional calls by hand: the parameters after the removed body move up by one, and a call still compiles when the body was typed `any` or has the same type as the next parameter, with the value now sent as that query parameter. DELETE and OPTIONS operations with a request body now send it, so servers receive a body they did not get before.
* **generator:** `generateEnumBasedOnDescription` now also names string enums and `enumStyle: "union"` enums, so their generated keys change from value-based names (e.g. `_1`) to the names in the description. Names are matched to `enum` by `Value`: description entries for values the enum does not have are no longer emitted, an enum value without a name falls back to value-based names, and an extra name for a value the enum lists only once is dropped with a warning. CLI runs with `-i`/`--input` and no config file always turn this option on, so they are affected without any setting.

### Features

* **generator:** name enum members from vendor extensions ([#137](https://github.com/ng-openapi/ng-openapi/issues/137)) ([b5198cc](https://github.com/ng-openapi/ng-openapi/commit/b5198ccb32fd7b8a5d5327aaf770d513287d0604)), closes [#31](https://github.com/ng-openapi/ng-openapi/issues/31)
* **generator:** support the HTTP QUERY method from OpenAPI 3.2 ([#141](https://github.com/ng-openapi/ng-openapi/issues/141)) ([58ffdc4](https://github.com/ng-openapi/ng-openapi/commit/58ffdc48f83c9bf3aeb7b8c0d5e81b8763448dfe))


### Bug Fixes

* **generator:** send request bodies with every method that can carry one ([#140](https://github.com/ng-openapi/ng-openapi/issues/140)) ([fd5e3f1](https://github.com/ng-openapi/ng-openapi/commit/fd5e3f121cc0ee49a47f499ce3c9631bdc23867d)), closes [#138](https://github.com/ng-openapi/ng-openapi/issues/138)

## [0.2.0](https://github.com/ng-openapi/ng-openapi/compare/http-resource-v0.1.3...http-resource-v0.2.0) (2026-09-08)


### ⚠ BREAKING CHANGES

* **generator:** three changes alter consumer code without a compile error.

### Bug Fixes

* **generator:** sanitize identifiers derived from spec names ([#127](https://github.com/ng-openapi/ng-openapi/issues/127)) ([77ebd9f](https://github.com/ng-openapi/ng-openapi/commit/77ebd9f1fb522ff3d2fb206457159366d32518b6))

## [0.1.3](https://github.com/ng-openapi/ng-openapi/compare/http-resource-v0.1.2...http-resource-v0.1.3) (2026-08-13)


### Bug Fixes

* **generator:** re-export plugin barrel directories from the root index.ts ([#123](https://github.com/ng-openapi/ng-openapi/issues/123)) ([20dc61b](https://github.com/ng-openapi/ng-openapi/commit/20dc61b0c3a28a251722ad7de3b0d9a582394090))

## [0.1.2](https://github.com/ng-openapi/ng-openapi/compare/http-resource-v0.1.1...http-resource-v0.1.2) (2026-07-27)


### Bug Fixes

* **generator:** generate correct ts-nocheck comment ([#116](https://github.com/ng-openapi/ng-openapi/issues/116)) ([dcf8590](https://github.com/ng-openapi/ng-openapi/commit/dcf8590d9900d0a0e85688e2866415508fe73035))
* **generator:** keep `| null` on nullable strings with uuid/email/uri/binary formats ([#119](https://github.com/ng-openapi/ng-openapi/issues/119)) ([6a3c307](https://github.com/ng-openapi/ng-openapi/commit/6a3c307359b740ba919a7df191a83a76b2a6413c))

## [0.1.1](https://github.com/ng-openapi/ng-openapi/compare/http-resource-v0.1.0...http-resource-v0.1.1) (2026-07-06)


### Features

* add modelFileStructure option for one model file per schema ([#113](https://github.com/ng-openapi/ng-openapi/issues/113)) ([085cc53](https://github.com/ng-openapi/ng-openapi/commit/085cc5339acf7edc8f052488e47581227d19a57b)), closes [#62](https://github.com/ng-openapi/ng-openapi/issues/62)
* add naming customization for generated services, resources and models ([#111](https://github.com/ng-openapi/ng-openapi/issues/111)) ([0ac5ffe](https://github.com/ng-openapi/ng-openapi/commit/0ac5ffe6ba50b1dc76ae07ca50a593957ef2d223)), closes [#16](https://github.com/ng-openapi/ng-openapi/issues/16)
* send Accept header derived from response content types ([#112](https://github.com/ng-openapi/ng-openapi/issues/112)) ([6d3a932](https://github.com/ng-openapi/ng-openapi/commit/6d3a932da5b0f113dcd272937cdecfd00224f42e))
* support emitting Angular 22 @Service decorator for generated services ([#110](https://github.com/ng-openapi/ng-openapi/issues/110)) ([54bb1f4](https://github.com/ng-openapi/ng-openapi/commit/54bb1f4da6365c823d59573daae4b4b20d5361d2)), closes [#104](https://github.com/ng-openapi/ng-openapi/issues/104)


### Bug Fixes

* **ng-openapi:** tolerate path-less specs — derive index exports from the Project ([#107](https://github.com/ng-openapi/ng-openapi/issues/107)) ([58c01e6](https://github.com/ng-openapi/ng-openapi/commit/58c01e67149f6918df27445cdbe0cff02a0f7752))

## [0.1.0](https://github.com/ng-openapi/ng-openapi/compare/http-resource-v0.0.32...http-resource-v0.1.0) (2026-07-06)


### ⚠ BREAKING CHANGES

* maintainability refactor — normalized spec model, generator decomposition, OpenAPI 3.1, docs & AI-readiness (phases 0–6) ([#103](https://github.com/ng-openapi/ng-openapi/issues/103))

### Features

* maintainability refactor — normalized spec model, generator decomposition, OpenAPI 3.1, docs & AI-readiness (phases 0–6) ([#103](https://github.com/ng-openapi/ng-openapi/issues/103)) ([963ffb4](https://github.com/ng-openapi/ng-openapi/commit/963ffb4f80fac3814be09d47a706882aa3a118c1))

## [0.0.32](https://github.com/ng-openapi/ng-openapi/compare/http-resource-v0.0.31...http-resource-v0.0.32) (2026-06-10)


### Features

* **deps:** refresh dev tooling, migrate Nx 22 and bump packages to fix vulnerabilities ([#82](https://github.com/ng-openapi/ng-openapi/issues/82)) ([5355aab](https://github.com/ng-openapi/ng-openapi/commit/5355aabfc67b4579413b7f5b742417d32b4af734))

## 0.0.31 (2026-05-16)

_No user-facing changes since 0.0.30 — version bumped for consistency across the workspace._
