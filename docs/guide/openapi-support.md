---
description: "Which Swagger and OpenAPI versions ng-openapi generates from, which OpenAPI 3.2 features are supported, and the Angular version each one needs."
title: OpenAPI Support
---

# OpenAPI Support

ng-openapi generates from Swagger 2.0 and from OpenAPI 3.0, 3.1 and 3.2 documents, in JSON or YAML. This page says what is generated for each version, which OpenAPI 3.2 features are supported, and which Angular version a feature needs.

## Specification Versions

| Version     | Status                   | Notes                                                                                                                              |
| ----------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| OpenAPI 3.2 | ✅ Supported             | See [OpenAPI 3.2 Features](#openapi-3-2-features) for the features added in this version                                           |
| OpenAPI 3.1 | ✅ Supported             |                                                                                                                                    |
| OpenAPI 3.0 | ✅ Supported             |                                                                                                                                    |
| Swagger 2.0 | ⚠️ Supported with limits | `in: body` and `in: formData` parameters are not generated, and each is warned about. Responses are typed `any`, without a warning |

The limits on this page are reported as warnings during generation, except where the page says otherwise. A warning names the operation and says what the generated code does instead. Two things are neither followed nor reported: a path item that is a `$ref` (to `components.pathItems` or to another file), whose operations are left out, and a JSON request body or response whose media type is a `$ref` (to `components.mediaTypes`), which is typed `any`.

## OpenAPI 3.2 Features

| Feature                                            | Status           | What is generated                                                                                                              |
| -------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `query` operations (the HTTP `QUERY` method)       | ✅ Supported     | A service method, and a resource with the [HTTP Resource plugin](./http-resource.md#query-operations). Requires Angular 22.3+  |
| `additionalOperations` (`COPY`, `PURGE`, custom …) | ✅ Supported     | A service method that sends the declared method. No resource: nothing says such a method is safe to repeat                     |
| `in: querystring` parameters                       | ✅ Supported     | Form-encoded: one argument per property. JSON or text: one argument, sent as the whole query string. In services and resources |
| `itemSchema` (JSON Lines, Server-Sent Events, …)   | ❌ Not supported | The item schema is not read, without a warning                                                                                 |

### The `QUERY` Method

`QUERY` is a safe, idempotent read like `GET` whose input travels in the request body, so it is not limited by URL length and can still be retried and cached. OpenAPI 3.2 declares it with the `query` field of a path item:

```yaml
paths:
    /products/search:
        query:
            operationId: searchProducts
            requestBody:
                required: true
                content:
                    application/json:
                        schema:
                            $ref: "#/components/schemas/ProductSearch"
            responses:
                "200":
                    description: The matching products
                    content:
                        application/json:
                            schema:
                                $ref: "#/components/schemas/ProductPage"
```

ng-openapi generates it with Angular's `HttpClient`, which supports the `QUERY` method from **Angular 22.3**:

```typescript
// services/products.service.ts
searchProducts(productSearch: ProductSearch, /* observe, options */): Observable<ProductPage> {
    // …
    return this.httpClient.request('query', url, { body: productSearch, /* … */ });
}
```

This is the same request `HttpClient.query()` sends; `request()` is used because it is the one call whose typings accept every `observe` and `responseType` the generated method offers. With the [HTTP Resource plugin](./http-resource.md#query-operations), the operation also becomes a resource whose body argument can be a signal.

::: warning QUERY requires Angular 22.3+
On older Angular versions the generated code still compiles and sends the request, but `HttpClient` treats it as a mutation: it attaches the XSRF token to the request, and server-side rendering does not reuse the response during hydration. Generation warns when it detects an older `@angular/core` in the workspace.
:::

### Additional Operations

A path item has a fixed field for each common method. Every other method is declared under `additionalOperations`, keyed by the method name:

```yaml
paths:
    /products/{productId}:
        additionalOperations:
            COPY:
                operationId: copyProduct
                requestBody: # …
                responses: # …
```

```typescript
copyProduct(productId: string, productCopy: ProductCopy, /* observe, options */): Observable<Product> {
    // …
    return this.httpClient.request('copy', url, { body: productCopy, /* … */ });
}
```

A few entries cannot be generated, and each is skipped with a warning:

- `TRACE`, `CONNECT` and `TRACK`, including the `trace` field of a path item: browsers refuse to send them.
- `JSONP`: Angular's `HttpClient` treats that name specially. Its XHR backend refuses it and `withJsonpSupport()` turns it into a script-tag request, so whether it would be sent depends on how the app sets up `HttpClient`.
- A method that has its own field (`POST` under `additionalOperations` instead of `post`), which OpenAPI does not allow.
- A key that is not a valid HTTP method name.

Method names are sent upper-cased, because Angular's `HttpClient` upper-cases them. A key written as `Copy` is sent as `COPY`, and generation says so. Two keys that differ only by case are one method: the one written in upper case is generated, and the other is skipped with a warning. When neither is in upper case, the first is generated, with the same notice that it is sent upper-cased.

### Querystring Parameters

An `in: querystring` parameter is the entire query string, described by one media type under `content`. What is generated depends on that media type.

**Form-encoded** (`application/x-www-form-urlencoded`): the properties of the schema are the `key=value` pairs of the query string, so each becomes an argument, exactly like an ordinary query parameter:

```yaml
parameters:
    - name: filter
      in: querystring
      required: true
      content:
          application/x-www-form-urlencoded:
              schema:
                  type: object
                  required: [text]
                  properties:
                      text: { type: string }
                      max-price: { type: number }
```

```typescript
filterProducts(text: string, maxPrice?: number, /* observe, options */): Observable<ProductPage>
// GET /products/filter?text=lamp&max-price=20
```

A property is required only when the parameter itself is `required` and its schema lists the property: a querystring parameter that is not required may be left out entirely.

**JSON or text** (`application/json`, any `+json` type, `text/plain`, `application/jsonpath`, …): the value is one argument, and its serialization is the whole query string, percent-encoded. Its name is taken from the parameter and is never sent:

```typescript
// in: querystring, application/json
matchProducts(criteria?: ProductSearch, /* observe, options */): Observable<Product[]>
// GET /products/match?%7B%22text%22%3A%22lamp%22%7D

// in: querystring, application/jsonpath
selectProducts(selector: string, /* observe, options */): Observable<Product[]>
// GET /products/select?%24.items%5B0%5D
```

With [`useSingleRequestParameter`](../api/configuration/options/use-single-request-parameter.md), these arguments are properties of the request object like every other. The [HTTP Resource plugin](./http-resource.md) takes each of them as a value or a signal.

A querystring parameter that cannot be generated is skipped with a warning: one without `content`, a form whose schema lists no top-level `properties`, a media type that is neither form-encoded, JSON nor text, and a JSON or text one declared next to `in: query` parameters, which OpenAPI does not allow.

## Angular Versions

| What you use                                                                       | Angular |
| ---------------------------------------------------------------------------------- | ------- |
| Generated services, models and providers                                           | 15+     |
| [HTTP Resource plugin](./http-resource.md)                                         | 19.2+   |
| [`serviceDecorator: 'service'`](../api/configuration/options/service-decorator.md) | 22+     |
| `QUERY` operations                                                                 | 22.3+   |

The first two are peer dependencies. The last two depend on what your configuration and your specification use, so they are checked during generation: when an older `@angular/core` is found in the workspace, a warning is printed and generation continues, since the workspace that runs the CLI is not always the one that compiles the output.

## Request Bodies

A request body becomes method arguments on every method that can carry one. It is taken and sent by content type:

- **JSON** — `application/json`, also with parameters, and any `+json` type such as `application/merge-patch+json` — is one typed argument.
- **Forms** — `multipart/form-data` and `application/x-www-form-urlencoded` — are one argument per field.
- **Text** — `text/*`, XML, YAML — is one `string`.
- **Binary** — everything else, including ranges such as `image/*` — is one `Blob`.

Sequential types (`application/jsonl`, `text/event-stream`) and other `multipart` types are not generated as request bodies, and are warned about. See [Generated Output](./generated-code.md#services-service-ts) for the `Content-Type` each one is sent with and for what happens when a body is declared several ways.
