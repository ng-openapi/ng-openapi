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
│   ├── http-params-builder.ts # Query-param serialization
│   └── http-stream.ts       # Readers for streamed responses (only when the spec has one)
├── providers.ts             # provide<ClientName>Client() setup function
└── index.ts                 # Main barrel export
```

Plugins add their own directories next to these:

- `validators/` — Zod schemas, one file per controller ([Zod plugin](../api/configuration/plugins/zod.md))
- `resources/` — `httpResource`-based services ([HTTP Resource plugin](../api/configuration/plugins/http-resource.md))

With [`generateServices: false`](../api/configuration/options/generate-services.md) only `models/`, the main `index.ts`, and any plugin directories are generated — plugins run regardless of this option. Pair that mode only with plugins whose output stands alone (Zod imports nothing but `zod`); the HTTP Resource plugin imports from `tokens/` and `utils/`, which this mode does not generate.

## File by File

### `models/index.ts`

One interface per schema in the spec, plus enums in the style you chose via [`enumStyle`](../api/configuration/options/enum-style.md). Date fields are typed `Date` or `string` depending on [`dateType`](../api/configuration/options/date-type.md). Type names can be decorated with a prefix/suffix via [`naming.models`](../api/configuration/options/naming.md).

With [`modelFileStructure: 'per-type'`](../api/configuration/options/model-file-structure.md), each schema instead gets its own `models/<kebab-name>.ts` file (plus `models/request-options.ts` for the `RequestOptions` interface), and `models/index.ts` becomes a pure barrel re-exporting them — imports from `../models` and the main `index.ts` are unaffected.

### `models/request-params.ts`

Only generated with [`useSingleRequestParameter`](../api/configuration/options/use-single-request-parameter.md): one exported `<MethodName>Params` interface per operation, re-exported through the `models` barrel.

### `services/*.service.ts`

One injectable service per controller (OpenAPI tag), using `inject(HttpClient)` and this client's base-path token. Class names default to `<Tag>Service` and can be decorated via [`naming.services`](../api/configuration/options/naming.md) (file names are unaffected). Classes are decorated with `@Injectable({ providedIn: "root" })`, or Angular 22+'s `@Service()` when [`serviceDecorator`](../api/configuration/options/service-decorator.md) is set to `'service'`. Method names come from `operationId`, optionally transformed by [`customizeMethodName`](../api/configuration/options/customize-method-name.md). Tags and `operationId`s are free-form text in a valid spec, so characters that cannot appear in a TypeScript identifier are treated as word separators: the tag `Groups (yes)` yields `GroupsYesService` in `groupsYes.service.ts`, and the `operationId` `groups_{group_id}_delete` yields the method `groupsGroupIdDelete`. When [`validation.response`](../api/configuration/options/validation.md) is enabled, each method accepts a `parse` hook in its trailing options parameter.

A request body becomes method arguments and is sent with the request, whatever the HTTP method. That includes `DELETE`, which Angular's `HttpClient` sends a body with just like `POST`, `PUT` and `PATCH`:

```typescript
// DELETE /orders/batch with a JSON requestBody
deleteOrders(deleteOrdersRequest: DeleteOrdersRequest, /* observe, options */): Observable<any> {
    // …
    return this.httpClient.request('delete', url, { body: deleteOrdersRequest, /* … */ });
}
```

How the body is taken and sent depends on the content type it is declared under:

| Declared as                                                                                           | Argument                     | `Content-Type` sent                                                               |
| ----------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| `application/json`, and JSON under another name: `application/json; charset=utf-8`, any `+json` type  | One, typed from the schema   | The declared one                                                                  |
| `multipart/form-data`                                                                                 | One per top-level field      | Left to the browser, which writes the boundary                                    |
| `application/x-www-form-urlencoded`                                                                   | One per top-level field      | `application/x-www-form-urlencoded`                                               |
| Text: `text/*`, XML, YAML                                                                             | One `string`                 | The declared one                                                                  |
| Anything else — `application/octet-stream`, `application/pdf`, `image/png`, a range such as `image/*` | One `Blob` (a `File` is one) | The declared one; the `Blob`'s own type for a range or for several declared types |

A JSON body is serialized by `HttpClient`; a `string` or a `Blob` is sent as it is, so for XML or YAML the caller passes the serialized text. The header is only a default: one passed in the trailing options argument is kept.

```typescript
// PATCH /widgets/{widgetId} with an application/merge-patch+json requestBody
patchWidget(widgetId: string, widgetPatch: WidgetPatch, /* observe, options */): Observable<any> {
    // …
    if (!headers.has('Content-Type')) {
        headers = headers.set('Content-Type', 'application/merge-patch+json');
    }
    return this.httpClient.request('patch', url, { body: widgetPatch, /* … */ });
}
```

When a body is declared under several content types, one is sent: `multipart/form-data` first, then `application/x-www-form-urlencoded` unless `application/json` is declared too, then `application/json`, then another JSON type, a text type, a binary type.

Two kinds of body cannot be passed as one value and are not generated: a sequential type (`application/jsonl`, `application/x-ndjson`, `text/event-stream`), which is a stream of items, and a `multipart` type other than `multipart/form-data`. The method then takes no argument for the body and sends the request without one, and generation warns about it:

```
⚠️ The request body of appendEvents ((POST) /events) is declared only as application/x-ndjson, which generated methods cannot send: a body gets an argument under a JSON, text or binary content type, and one argument per field under multipart/form-data or application/x-www-form-urlencoded. Sequential types (JSON Lines, event streams) and other multipart types are not generated as request bodies. Generated methods take no argument for it and send the request without a body. Declare the body under a content type that is generated to have it sent.
```

An operation that declares both `multipart/form-data` and `application/x-www-form-urlencoded` sends the multipart body, so only its fields become arguments. A field that only the urlencoded form lists is warned about:

```
⚠️ The request body of upload ((POST) /upload) is declared as both multipart/form-data and application/x-www-form-urlencoded. Generated methods send the multipart/form-data one, so the field "note", which only the application/x-www-form-urlencoded form lists, gets no argument and is not sent. List it in the multipart/form-data schema too, or declare one form.
```

The fields of a form are the top-level `properties` of its schema. A form schema that lists none — fields inherited through `allOf`, `additionalProperties`, a bare `type: object` — leaves the method with no argument for the body and nothing to send, and is warned about:

```
⚠️ The multipart/form-data request body of uploadAvatar ((POST) /avatar) has no fields to generate: form fields are read from the top-level `properties` of its schema, and it lists none (`allOf`, `additionalProperties` and free-form objects are not expanded). Generated methods take no argument for it and send the request without a body. List the fields as `properties` of the body schema to have them generated.
```

`GET` and `HEAD` are the exception among the methods, because no browser sends a body with them: `fetch` rejects such a request and `XMLHttpRequest` drops the body. A request body declared on one is left out — the method takes no body argument and sets no `Content-Type` — and warned about:

```
⚠️ The request body of searchItems ((GET) /items/search) was skipped: browsers do not send a body with GET requests. Generated methods take no body and no validator is generated for it. Describe the input as query parameters, or use a method that carries a body.
```

OpenAPI 3.2's `query` operations — the HTTP `QUERY` method, a safe and idempotent read like `GET` whose input travels in the request body — are generated like every other operation, with the body bound and sent as described above:

```typescript
// QUERY /products/search with a JSON requestBody
searchProducts(productSearch: ProductSearch, /* observe, options */): Observable<any> {
    // …
    return this.httpClient.request('query', url, { body: productSearch, /* … */ });
}
```

A `QUERY` body that cannot be sent gets the warning above like on every other method, and it matters more here: the body is the operation's whole input, so the generated method sends a query with nothing in it.

::: warning QUERY requires Angular 22.3+
Angular's `HttpClient` supports the `QUERY` method from 22.3 on. The generated code compiles and sends the request on older versions too, but `HttpClient` then treats it as a mutation: it attaches the XSRF token to the request, and server-side rendering does not reuse the response during hydration.
:::

When the spec declares `QUERY` operations and an `@angular/core` older than 22.3 is detected in the workspace the generator runs in, a warning is printed; generation still proceeds, since the workspace running the CLI is not always the workspace that compiles the output (monorepos, CI):

```
⚠️ Operation searchProducts ((QUERY) /products/search) uses the HTTP QUERY method, which Angular's HttpClient supports from 22.3 — found @angular/core 21.2.13 in this workspace. The generated code still compiles and sends the request there, but HttpClient treats it as a mutation: it attaches the XSRF token to it, and server-side rendering does not reuse its response during hydration.
```

A response in a sequential media type is read by its items. With OpenAPI 3.2's `itemSchema` it is a stream: the method has a single signature and returns `Observable<Item>`, one emission per item. With an array `schema` it is complete: the method keeps the standard signature, fetches the response as text and returns the parsed array. See [OpenAPI Support](./openapi-support.md#streamed-responses).

OpenAPI 3.2's `in: querystring` parameter — one parameter that is the entire query string — is generated by its media type: a form-encoded one as one argument per property, sent like ordinary query parameters; a JSON or text one as a single argument, appended to the URL as the whole query string (`` `${this.basePath}/products/select?${encodeURIComponent(selector)}` ``). See [OpenAPI Support](./openapi-support.md#querystring-parameters).

A method the path item has no field for — `COPY`, `PURGE`, a custom one — is declared under OpenAPI 3.2's `additionalOperations` and generated the same way, as `this.httpClient.request('copy', url, { … })`. `TRACE`, `CONNECT` and `TRACK` are skipped with a warning, because browsers refuse to send them. See [OpenAPI Support](./openapi-support.md#additional-operations).

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

### `utils/http-stream.ts`

Only generated when the specification has a response in a sequential media type — JSON Lines, NDJSON, JSON text sequences or Server-Sent Events. `HttpClient` fetches such a response as text and has no parser for it, so this file holds the readers the generated services use:

- `streamJsonLines()`, `streamJsonSequence()` and `streamServerSentEvents()` are RxJS operators that turn the events of a request into the items of its response, emitting each one as soon as it is complete. They are what a method for a response with [`itemSchema`](./openapi-support.md#streamed-responses) pipes through.
- `parseJsonLines()`, `parseJsonSequence()` and `parseServerSentEvents()` split a response that has ended into all its items.

They are exported from the output root, so you can use them with requests of your own.

### `providers.ts`

The `provide<ClientName>Client()` function (e.g. `provideDefaultClient`) plus its config interface. Wires up the base-path token, the base interceptor, client-scoped interceptors, and (with `dateType: "Date"`) the date interceptor. See the [Providers reference](../api/providers.md).

### `index.ts`

Barrel export of everything above — including any plugin directories (e.g. `resources/`, `validators/`) — so consumers can import from the output root.

### `package.json`, `ng-package.json`, `tsconfig.json`, `README.md`, `.gitignore`

Only with the [`package`](../api/configuration/package.md) option: the files that make the output directory a buildable, publishable Angular library. See [Publishing as an npm Package](./npm-package.md).

## Schema References

- `$ref` to a whole schema (`#/components/schemas/Pet`) — an imported model in `models/`.
- `$ref` to a property inside a schema (`#/components/schemas/PolicyEntry/properties/namespaces`) — inlined at each use, no extra model.

An unresolvable or cyclic property `$ref` is left as-is and warned about:

```
⚠️ Could not resolve nested $ref "#/components/schemas/Missing/properties/nope". The generated type will not match the spec (generated files ship @ts-nocheck, so this surfaces as a silently wrong type rather than a compile error).
```

Your build stays green — that is the point of the warning. Generated files carry `@ts-nocheck`, so the dangling type name degrades to `any` instead of failing compilation, and the warning is the only signal that the API surface is wrong.

Fix the spec: promote the target to a named schema and reference that.

Only pointers under `#/components/schemas/…` and `#/definitions/…` are inlined. A deep pointer into any other root — `#/components/responses/Error/content/application~1json/schema`, `#/paths/…/schema`, Swagger 2.0 `#/parameters/X/schema`, the shape `redocly bundle` and `swagger-cli bundle` emit for a repeated subschema — is passed through and warned about, naming the type the output will contain so you can search for it:

```
⚠️ Nested $ref "#/components/responses/Error/content/application~1json/schema" points into a part of the document this generator does not inline (only #/components/schemas/… and #/definitions/… are) — it will be emitted as the type "Schema", which nothing defines. Promote the target to a named schema and reference that. …
```

Reusable operation parts are resolved too: a parameter, request body or response written as a `$ref` to `#/components/parameters/…`, `#/components/requestBodies/…` or `#/components/responses/…` (Swagger 2.0: `#/parameters/…`, `#/responses/…`) generates exactly as if it were written inline. One that does not resolve — a missing name, a pointer to another kind of component, another document, a cycle — is skipped and warned about:

```
⚠️ The "4XX" response of getPet ((GET) /pets/{petId}) references "#/components/responses/ClientError", which does not resolve: there is no response component named "ClientError". The response was skipped: no validator is generated from it.
```

## Regeneration Notes

- Every file starts with a "Generated by ng-openapi — do not edit" header; regeneration overwrites them, so put customizations in your own code (interceptors, wrappers), never in the output directory.
- Generated files carry `@ts-nocheck` and `eslint-disable` pragmas so they don't fight your project's lint/strict settings.
- Add the output directory to your API-generation script rather than committing manual tweaks — see [CLI Usage](./cli-usage.md) for workflow recipes.
