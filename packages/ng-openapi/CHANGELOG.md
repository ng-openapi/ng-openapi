# Changelog

## [0.7.0](https://github.com/ng-openapi/ng-openapi/compare/ng-openapi-v0.6.0...ng-openapi-v0.7.0) (2026-11-22)


### ⚠ BREAKING CHANGES

* **generator:** a response declared under application/jsonl, application/x-ndjson, application/json-seq or text/event-stream with a schema that describes one item (not an array, not a string) is generated as a streaming method: one signature without the observe overloads, returning `Observable<Item>` with one emission per item. A call that passed observe to such a method must drop the argument, and the httpResource plugin no longer generates a resource for such an operation. These methods used to parse the response as one JSON document, which worked only for a response of a single line.
* **generator:** a request body declared under a content type other than exactly application/json, multipart/form-data or application/x-www-form-urlencoded is now generated. JSON under another content type (application/merge-patch+json, application/json; charset=utf-8, any +json type) becomes a typed argument, a text body (any `text/*` type, XML, YAML) a string argument, and any other body a Blob argument; under `*/*` or `application/*` the body's schema decides which of the three. A form declared with media-type parameters (application/x-www-form-urlencoded; charset=UTF-8) is bound field by field where the operation declares none of application/json, multipart/form-data and application/x-www-form-urlencoded exactly. Affected methods gain that argument, placed like any body argument, so parameters after it move and positional calls must be updated; with useSingleRequestParameter the `<Operation>Params` interface gains the property. These requests now declare the content type the spec names instead of application/json, and a request that sends no body no longer sets Content-Type: application/json. The zod plugin generates an `<operation>Body` validator for JSON bodies under another content type, and for an operation that declares multipart/form-data next to application/json the validator describes the multipart form that is sent. Plugin API, re-exported from ng-openapi: the contentType option of emitHeaders and defaultContentType no longer read hasBody and take isMultipart, isUrlEncoded and bodyContentType, so a plugin passing only the old facts gets no Content-Type for a JSON body and should pass the normalized operation; getRequestBodyType also reads a JSON body under another JSON content key, where it returned any.

### Features

* **generator:** bind JSON, text and binary request bodies under any content type ([#144](https://github.com/ng-openapi/ng-openapi/issues/144)) ([9cedeed](https://github.com/ng-openapi/ng-openapi/commit/9cedeed3a69eb9eeaa94c5c8a47d846b8f93a25b))
* **generator:** generate in: querystring parameters ([#145](https://github.com/ng-openapi/ng-openapi/issues/145)) ([db043ee](https://github.com/ng-openapi/ng-openapi/commit/db043eefd42b94d2c49f34f538647faacf268b56))
* **generator:** generate methods declared under additionalOperations ([#142](https://github.com/ng-openapi/ng-openapi/issues/142)) ([754de3d](https://github.com/ng-openapi/ng-openapi/commit/754de3d142455758bc732d664e0eec5dd6562f39))
* **generator:** generate streaming methods for itemSchema responses ([#146](https://github.com/ng-openapi/ng-openapi/issues/146)) ([212033a](https://github.com/ng-openapi/ng-openapi/commit/212033a1fb1e72a5ef5944843545fafe9ac443aa))

## [0.6.0](https://github.com/ng-openapi/ng-openapi/compare/ng-openapi-v0.5.0...ng-openapi-v0.6.0) (2026-11-21)


### ⚠ BREAKING CHANGES

* **generator:** an operation that declares both multipart/form-data and application/x-www-form-urlencoded no longer takes arguments for fields that only the urlencoded form lists. Generated methods have always sent the multipart body, so these arguments were accepted and never sent; generation now warns about each such field. Regenerate and remove the argument from callers. Review positional calls by hand: the parameters after a removed field move up by one, so a call still compiles when the next parameter has the same type, with the value now sent in its place — `upload(file, "my note")` against `(file, note?, tag?)` becomes a call to `(file, tag?)` and sends `?tag=my%20note`. Operations whose two forms list the same fields keep their signature.
* **generator:** a request body declared on a GET or HEAD operation is no longer generated. The method loses its body argument and no longer sets `Content-Type: application/json`; the body itself was never sent. With `useSingleRequestParameter`, `<Operation>Params` loses the body property, and when the body was the operation's only input the interface is no longer generated and the method loses its `request` argument, so imports of that interface break. The zod plugin no longer generates the `<operation>Body` validator or its `<Operation>Body` type for these operations. Regenerate and remove the argument from callers. Review positional calls by hand: the parameters after the removed body move up by one, and a call still compiles when the body was typed `any` or has the same type as the next parameter, with the value now sent as that query parameter. DELETE and OPTIONS operations with a request body now send it, so servers receive a body they did not get before.
* **generator:** `generateEnumBasedOnDescription` now also names string enums and `enumStyle: "union"` enums, so their generated keys change from value-based names (e.g. `_1`) to the names in the description. Names are matched to `enum` by `Value`: description entries for values the enum does not have are no longer emitted, an enum value without a name falls back to value-based names, and an extra name for a value the enum lists only once is dropped with a warning. CLI runs with `-i`/`--input` and no config file always turn this option on, so they are affected without any setting.

### Features

* **generator:** name enum members from vendor extensions ([#137](https://github.com/ng-openapi/ng-openapi/issues/137)) ([b5198cc](https://github.com/ng-openapi/ng-openapi/commit/b5198ccb32fd7b8a5d5327aaf770d513287d0604)), closes [#31](https://github.com/ng-openapi/ng-openapi/issues/31)
* **generator:** support the HTTP QUERY method from OpenAPI 3.2 ([#141](https://github.com/ng-openapi/ng-openapi/issues/141)) ([58ffdc4](https://github.com/ng-openapi/ng-openapi/commit/58ffdc48f83c9bf3aeb7b8c0d5e81b8763448dfe))


### Bug Fixes

* **generator:** send request bodies with every method that can carry one ([#140](https://github.com/ng-openapi/ng-openapi/issues/140)) ([fd5e3f1](https://github.com/ng-openapi/ng-openapi/commit/fd5e3f121cc0ee49a47f499ce3c9631bdc23867d)), closes [#138](https://github.com/ng-openapi/ng-openapi/issues/138)

## [0.5.0](https://github.com/ng-openapi/ng-openapi/compare/ng-openapi-v0.4.1...ng-openapi-v0.5.0) (2026-10-29)


### ⚠ BREAKING CHANGES

* **generator:** generated methods whose request body is a `$ref` to `components/requestBodies` now take that body as a parameter, and methods whose responses are `$ref`s to `components/responses` return the referenced model instead of `any`. Regenerate and fix the resulting compile errors; check positional calls on methods that gained an optional body, since it is inserted before the optional query parameters.

### Bug Fixes

* **generator:** resolve $ref responses and request bodies in the normalizer ([#133](https://github.com/ng-openapi/ng-openapi/issues/133)) ([242e8c7](https://github.com/ng-openapi/ng-openapi/commit/242e8c7c423658560f529398df76dab8a20c43c6)), closes [#132](https://github.com/ng-openapi/ng-openapi/issues/132)

## [0.4.1](https://github.com/ng-openapi/ng-openapi/compare/ng-openapi-v0.4.0...ng-openapi-v0.4.1) (2026-09-24)


### Features

* **generator:** emit npm package scaffold via `package` option ([#130](https://github.com/ng-openapi/ng-openapi/issues/130)) ([d851fb0](https://github.com/ng-openapi/ng-openapi/commit/d851fb0824350f89688fe5e42a601f175b5e0b2e))

## [0.4.0](https://github.com/ng-openapi/ng-openapi/compare/ng-openapi-v0.3.3...ng-openapi-v0.4.0) (2026-09-08)


### ⚠ BREAKING CHANGES

* **generator:** three changes alter consumer code without a compile error.

### Bug Fixes

* **generator:** sanitize identifiers derived from spec names ([#127](https://github.com/ng-openapi/ng-openapi/issues/127)) ([77ebd9f](https://github.com/ng-openapi/ng-openapi/commit/77ebd9f1fb522ff3d2fb206457159366d32518b6))
* **shared:** resolve deep-pointer $refs to nested schema properties ([#121](https://github.com/ng-openapi/ng-openapi/issues/121)) ([33f1104](https://github.com/ng-openapi/ng-openapi/commit/33f110401e218d0b2255416ab214ad9db3ba328e))

## [0.3.3](https://github.com/ng-openapi/ng-openapi/compare/ng-openapi-v0.3.2...ng-openapi-v0.3.3) (2026-08-13)


### Bug Fixes

* **generator:** re-export plugin barrel directories from the root index.ts ([#123](https://github.com/ng-openapi/ng-openapi/issues/123)) ([20dc61b](https://github.com/ng-openapi/ng-openapi/commit/20dc61b0c3a28a251722ad7de3b0d9a582394090))

## [0.3.2](https://github.com/ng-openapi/ng-openapi/compare/ng-openapi-v0.3.1...ng-openapi-v0.3.2) (2026-07-27)


### Bug Fixes

* **generator:** generate correct ts-nocheck comment ([#116](https://github.com/ng-openapi/ng-openapi/issues/116)) ([dcf8590](https://github.com/ng-openapi/ng-openapi/commit/dcf8590d9900d0a0e85688e2866415508fe73035))
* **generator:** keep `| null` on nullable strings with uuid/email/uri/binary formats ([#119](https://github.com/ng-openapi/ng-openapi/issues/119)) ([6a3c307](https://github.com/ng-openapi/ng-openapi/commit/6a3c307359b740ba919a7df191a83a76b2a6413c))

## [0.3.1](https://github.com/ng-openapi/ng-openapi/compare/ng-openapi-v0.3.0...ng-openapi-v0.3.1) (2026-07-06)


### Features

* add modelFileStructure option for one model file per schema ([#113](https://github.com/ng-openapi/ng-openapi/issues/113)) ([085cc53](https://github.com/ng-openapi/ng-openapi/commit/085cc5339acf7edc8f052488e47581227d19a57b)), closes [#62](https://github.com/ng-openapi/ng-openapi/issues/62)
* add naming customization for generated services, resources and models ([#111](https://github.com/ng-openapi/ng-openapi/issues/111)) ([0ac5ffe](https://github.com/ng-openapi/ng-openapi/commit/0ac5ffe6ba50b1dc76ae07ca50a593957ef2d223)), closes [#16](https://github.com/ng-openapi/ng-openapi/issues/16)
* send Accept header derived from response content types ([#112](https://github.com/ng-openapi/ng-openapi/issues/112)) ([6d3a932](https://github.com/ng-openapi/ng-openapi/commit/6d3a932da5b0f113dcd272937cdecfd00224f42e))
* support emitting Angular 22 @Service decorator for generated services ([#110](https://github.com/ng-openapi/ng-openapi/issues/110)) ([54bb1f4](https://github.com/ng-openapi/ng-openapi/commit/54bb1f4da6365c823d59573daae4b4b20d5361d2)), closes [#104](https://github.com/ng-openapi/ng-openapi/issues/104)


### Bug Fixes

* **ng-openapi:** tolerate path-less specs — derive index exports from the Project ([#107](https://github.com/ng-openapi/ng-openapi/issues/107)) ([58c01e6](https://github.com/ng-openapi/ng-openapi/commit/58c01e67149f6918df27445cdbe0cff02a0f7752))

## [0.3.0](https://github.com/ng-openapi/ng-openapi/compare/ng-openapi-v0.2.22...ng-openapi-v0.3.0) (2026-07-06)


### ⚠ BREAKING CHANGES

* maintainability refactor — normalized spec model, generator decomposition, OpenAPI 3.1, docs & AI-readiness (phases 0–6) ([#103](https://github.com/ng-openapi/ng-openapi/issues/103))

### Features

* maintainability refactor — normalized spec model, generator decomposition, OpenAPI 3.1, docs & AI-readiness (phases 0–6) ([#103](https://github.com/ng-openapi/ng-openapi/issues/103)) ([963ffb4](https://github.com/ng-openapi/ng-openapi/commit/963ffb4f80fac3814be09d47a706882aa3a118c1))

## [0.2.22](https://github.com/ng-openapi/ng-openapi/compare/ng-openapi-v0.2.21...ng-openapi-v0.2.22) (2026-07-05)


### Bug Fixes

* **ng-openapi:** avoid fixMissingImports crash in request-params generation ([#94](https://github.com/ng-openapi/ng-openapi/issues/94)) ([8a30358](https://github.com/ng-openapi/ng-openapi/commit/8a303581158eb86e709e6b1489b3542e9a88da74))

## [0.2.21](https://github.com/ng-openapi/ng-openapi/compare/ng-openapi-v0.2.20...ng-openapi-v0.2.21) (2026-07-05)


### Features

* **ng-openapi:** add useSingleRequestParameter option for request object parameters ([#92](https://github.com/ng-openapi/ng-openapi/issues/92)) ([9085680](https://github.com/ng-openapi/ng-openapi/commit/908568009bb87caaa9dee316f1869ee549a09ff4))

## [0.2.20](https://github.com/ng-openapi/ng-openapi/compare/ng-openapi-v0.2.19...ng-openapi-v0.2.20) (2026-06-10)


### Features

* **date-transformer:** customizable date regex with broader default ([#87](https://github.com/ng-openapi/ng-openapi/issues/87)) ([2ff96d6](https://github.com/ng-openapi/ng-openapi/commit/2ff96d651984ee0e7f076553db0a30922e446a6b))
* **deps:** refresh dev tooling, migrate Nx 22 and bump packages to fix vulnerabilities ([#82](https://github.com/ng-openapi/ng-openapi/issues/82)) ([5355aab](https://github.com/ng-openapi/ng-openapi/commit/5355aabfc67b4579413b7f5b742417d32b4af734))

## [0.2.19](https://github.com/ng-openapi/ng-openapi/compare/ng-openapi@0.2.18...ng-openapi-v0.2.19) (2026-05-16)

### Bug Fixes

- **file-download.generator:** error when using strict typings ([40396ad](https://github.com/ng-openapi/ng-openapi/commit/40396ad042735a3af45fc288c2e82a91fc7951a8))
- **file-download.generator:** error when using strict typings ([6c00a59](https://github.com/ng-openapi/ng-openapi/commit/6c00a59fc9ec273bdca764f7436f6fecfae26451))
