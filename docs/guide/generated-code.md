---
description: "File-by-file tour of everything ng-openapi writes into your output directory."
title: Generated Output
---

# Generated Output

What ng-openapi actually writes into your output directory, file by file. This is the canonical reference for the generated structure — other pages link here instead of repeating it.

## The Full Tree

With the default configuration (`generateServices: true`, `dateType: "Date"`):

```
<output>/
├── models/
│   ├── index.ts             # TypeScript interfaces, enums / unions
│   ├── *.ts                 # One file per schema (only with modelFileStructure: 'per-type')
│   └── request-params.ts    # Request-object interfaces (only with useSingleRequestParameter)
├── services/
│   ├── index.ts             # Service exports
│   └── *.service.ts         # One Angular service per controller/tag
├── tokens/
│   └── index.ts             # Injection tokens for this client
├── utils/
│   ├── base-interceptor.ts  # Routes client-scoped interceptors
│   ├── date-transformer.ts  # Date interceptor (only with dateType: "Date")
│   ├── file-download.ts     # Download helpers
│   └── http-params-builder.ts # Query-param serialization
├── providers.ts             # provide<ClientName>Client() setup function
└── index.ts                 # Main barrel export
```

Plugins add their own directories next to these:

- `validators/` — Zod schemas, one file per controller ([Zod plugin](../api/configuration/plugins/zod.md))
- `resources/` — `httpResource`-based services ([HTTP Resource plugin](../api/configuration/plugins/http-resource.md))

With [`generateServices: false`](../api/configuration/options/generate-services.md) only `models/` and the main `index.ts` are generated.

## File by File

### `models/index.ts`

One interface per schema in the spec, plus enums in the style you chose via [`enumStyle`](../api/configuration/options/enum-style.md). Date fields are typed `Date` or `string` depending on [`dateType`](../api/configuration/options/date-type.md). Type names can be decorated with a prefix/suffix via [`naming.models`](../api/configuration/options/naming.md).

With [`modelFileStructure: 'per-type'`](../api/configuration/options/model-file-structure.md), each schema instead gets its own `models/<kebab-name>.ts` file (plus `models/request-options.ts` for the `RequestOptions` interface), and `models/index.ts` becomes a pure barrel re-exporting them — imports from `../models` and the main `index.ts` are unaffected.

### `models/request-params.ts`

Only generated with [`useSingleRequestParameter`](../api/configuration/options/use-single-request-parameter.md): one exported `<MethodName>Params` interface per operation, re-exported through the `models` barrel.

### `services/*.service.ts`

One injectable service per controller (OpenAPI tag), using `inject(HttpClient)` and this client's base-path token. Class names default to `<Tag>Service` and can be decorated via [`naming.services`](../api/configuration/options/naming.md) (file names are unaffected). Classes are decorated with `@Injectable({ providedIn: "root" })`, or Angular 22+'s `@Service()` when [`serviceDecorator`](../api/configuration/options/service-decorator.md) is set to `'service'`. Method names come from `operationId`, optionally transformed by [`customizeMethodName`](../api/configuration/options/customize-method-name.md). When [`validation.response`](../api/configuration/options/validation.md) is enabled, each method accepts a `parse` hook in its trailing options parameter.

### `tokens/index.ts`

Injection tokens namespaced per client so multiple clients can coexist (see [Multiple Clients](./multiple-clients.md)):

- `BASE_PATH_<CLIENTNAME>` — the API base URL (falls back to `/api`)
- `HTTP_INTERCEPTORS_<CLIENTNAME>` — this client's interceptor instances
- `CLIENT_CONTEXT_TOKEN_<CLIENTNAME>` — `HttpContext` token marking which client a request belongs to

For the default client, deprecated `BASE_PATH` / `CLIENT_CONTEXT_TOKEN` aliases are kept for backwards compatibility.

### `utils/base-interceptor.ts`

A global interceptor that checks each request's `HttpContext` and applies this client's interceptor chain only to requests made by this client's services — that's what keeps interceptors from leaking across clients.

### `utils/date-transformer.ts`

Only generated with `dateType: "Date"`. Contains `ISO_DATE_REGEX`, `transformDates`, and the `DateInterceptor` that converts ISO date strings in responses to `Date` objects. See the [Date Transformer reference](../api/utilities/date-transformer.md).

### `utils/file-download.ts`

`downloadFile`, `downloadFileOperator`, and `extractFilenameFromContentDisposition` for handling blob downloads. See the [File Download Helper reference](../api/utilities/file-download-helper.md).

### `utils/http-params-builder.ts`

Serializes query parameters into `HttpParams`, handling arrays, nested objects, and `Date` values. Used internally by the generated services.

### `providers.ts`

The `provide<ClientName>Client()` function (e.g. `provideDefaultClient`) plus its config interface. Wires up the base-path token, the base interceptor, client-scoped interceptors, and (with `dateType: "Date"`) the date interceptor. See the [Providers reference](../api/providers.md).

### `index.ts`

Barrel export of everything above, so consumers can import from the output root.

## Regeneration Notes

- Every file starts with a "Generated by ng-openapi — do not edit" header; regeneration overwrites them, so put customizations in your own code (interceptors, wrappers), never in the output directory.
- Generated files carry `@ts-nocheck` and `eslint-disable` pragmas so they don't fight your project's lint/strict settings.
- Add the output directory to your API-generation script rather than committing manual tweaks — see [CLI Usage](./cli-usage.md) for workflow recipes.
