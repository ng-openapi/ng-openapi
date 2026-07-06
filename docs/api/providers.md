---
description: "Generated provider functions: basePath, client-scoped interceptors, and date transform options."
title: Providers
---

# Providers

Every generated client ships a provider function in its `providers.ts` that sets up the client in your Angular application. The function is named after the [`clientName`](configuration/client-name.md): `provide<ClientName>Client` (e.g. `providePetStoreClient`). Without a `clientName` it is `provideDefaultClient`.

## Usage

```typescript
import { provideDefaultClient } from "./api/providers"; // generated file in your output directory
import { defaultClientInterceptor } from "./api/utils/base-interceptor";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { ApplicationConfig } from "@angular/core";

export const appConfig: ApplicationConfig = {
    providers: [
        provideHttpClient(withInterceptors([defaultClientInterceptor])),
        provideDefaultClient({
            basePath: "https://api.example.com",
        }),
    ],
};
```

The generated `<clientName>ClientInterceptor` (e.g. `defaultClientInterceptor`) runs the client's scoped interceptor chain — the [date transformer](utilities/date-transformer.md) and everything passed via [`interceptors`](#interceptors) / [`interceptorFns`](#interceptorfns). Register it once with `withInterceptors([...])`; requests made by other clients or plain `HttpClient` calls pass through untouched.

::: info
`provideNgOpenapi` still exists as a deprecated alias of `provideDefaultClient` for clients generated without a `clientName`.
:::

### DI-based registration

Apps that still register interceptors through dependency injection can use the generated class variant instead. `provide<ClientName>Client` registers it on `HTTP_INTERCEPTORS` automatically, so enabling `withInterceptorsFromDi()` is enough:

```typescript
provideHttpClient(withInterceptorsFromDi());
```

::: warning
Register exactly one of the two variants. Combining `withInterceptors([defaultClientInterceptor])` with `withInterceptorsFromDi()` runs the client's interceptor chain twice — duplicate auth headers, doubled logs. If your app needs `withInterceptorsFromDi()` for its own interceptors while this client's chain is registered functionally, disable the automatic class registration with [`registerDiInterceptor: false`](#registerdiinterceptor).
:::

## Configuration Options

### `basePath`

**Type:** `string` | **Required**

The base URL for your API. This is prepended to all API requests.

### `interceptors`

**Type:** `(new (...args: any[]) => HttpInterceptor)[]` | **Default:** `[]`

Apply client specific class-based interceptors. Pass the interceptor **classes** (not instances) — the provider resolves them through DI when they are provided (so constructor injection works), otherwise instantiates them directly. This is not going to replace the global interceptors configured in your application, but will be applied to requests made by the provided client.

Interceptors can be re-used across different clients.

```typescript
provideDefaultClient({
    basePath: "https://api.example.com",
    interceptors: [AuthInterceptor, LoggingInterceptor], // classes, not instances
});
```

### `interceptorFns`

**Type:** `HttpInterceptorFn[]` | **Default:** `[]`

Apply client specific [functional interceptors](https://angular.dev/guide/http/interceptors). Like `interceptors`, they only run for requests made by this client. They run after the class-based `interceptors` and may use `inject()` in their body.

```typescript
const authInterceptor: HttpInterceptorFn = (req, next) => {
    const token = inject(AuthStore).token();
    return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

provideDefaultClient({
    basePath: "https://api.example.com",
    interceptorFns: [authInterceptor],
});
```

### `registerDiInterceptor`

**Type:** `boolean` | **Default:** `true`

Whether the provide function registers the class-based scoped interceptor on `HTTP_INTERCEPTORS`. That registration is dormant unless the app enables `withInterceptorsFromDi()` — but if it does, and this client's chain is *also* registered via `withInterceptors([defaultClientInterceptor])`, the chain runs twice. Set this to `false` in that situation:

```typescript
export const appConfig: ApplicationConfig = {
    providers: [
        // withInterceptorsFromDi() needed for the app's own DI-based interceptors
        provideHttpClient(withInterceptors([defaultClientInterceptor]), withInterceptorsFromDi()),
        provideDefaultClient({
            basePath: "https://api.example.com",
            registerDiInterceptor: false, // client chain comes from withInterceptors above
        }),
    ],
};
```

Leave it at `true` (default) when the client chain should run through `withInterceptorsFromDi()` itself.

### `enableDateTransform`

**Type:** `boolean` | **Default:** `true`

If disabled, [Date Transformer Interceptor](utilities/date-transformer.md) will not be applied to the HTTP client. This means date strings will not be automatically converted to `Date` objects.

### `dateTransformRegex`

**Type:** `RegExp` | **Default:** [`ISO_DATE_REGEX`](utilities/date-transformer.md#recognized-formats)

Overrides the pattern the [Date Transformer Interceptor](utilities/date-transformer.md) uses to detect which string values are dates. Use it when your API returns a format the default pattern doesn't cover, without having to copy the generated `date-transformer.ts`. Only available when the client was generated with `dateType: 'Date'`.

```typescript
provideDefaultClient({
    basePath: "https://api.example.com",
    dateTransformRegex: /your-custom-pattern/,
});
```

## Manual Configuration

If you prefer to manually configure the OpenAPI client without using the provider, you can do so by setting up the base path token from the generated `tokens/` directory. This is useful for more complex scenarios where you need fine-grained control over the configuration.

```typescript
import { provideHttpClient } from "@angular/common/http";
import { ApplicationConfig } from "@angular/core";
import { BASE_PATH } from "./api/tokens";

export const appConfig: ApplicationConfig = {
    providers: [provideHttpClient(), { provide: BASE_PATH, useValue: "https://api.example.com" }],
};
```

The token is named after the client (`BASE_PATH_<CLIENTNAME>`, e.g. `BASE_PATH_PETSTORE`); for the default client, `BASE_PATH` is a deprecated alias of `BASE_PATH_DEFAULT`.
