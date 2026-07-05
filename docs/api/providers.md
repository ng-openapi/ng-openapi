---
description: "Generated provider functions: basePath, client-scoped interceptors, and date transform options."
title: Providers
---

# Providers

Every generated client ships a provider function in its `providers.ts` that sets up the client in your Angular application. The function is named after the [`clientName`](configuration/client-name.md): `provide<ClientName>Client` (e.g. `providePetStoreClient`). Without a `clientName` it is `provideDefaultClient`.

## Usage

```typescript
import { provideDefaultClient } from "./api/providers"; // generated file in your output directory
import { provideHttpClient } from "@angular/common/http";
import { ApplicationConfig } from "@angular/core";

export const appConfig: ApplicationConfig = {
    providers: [
        provideHttpClient(),
        provideDefaultClient({
            basePath: "https://api.example.com",
        }),
    ],
};
```

::: info
`provideNgOpenapi` still exists as a deprecated alias of `provideDefaultClient` for clients generated without a `clientName`.
:::

## Configuration Options

### `basePath`

**Type:** `string` | **Required**

The base URL for your API. This is prepended to all API requests.

### `interceptors`

**Type:** `(new () => HttpInterceptor)[]` | **Default:** `[]`

Apply client specific interceptors. Pass the interceptor **classes** (not instances) — the provider instantiates them for you. This is not going to replace the global interceptors configured in your application, but will be applied to requests made by the provided client.

Interceptors can be re-used across different clients.

```typescript
provideDefaultClient({
    basePath: "https://api.example.com",
    interceptors: [AuthInterceptor, LoggingInterceptor], // classes, not instances
});
```

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
