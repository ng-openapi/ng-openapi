---
title: Providers
---

# Providers

The `provideNgOpenapi` function sets up the OpenAPI client in your Angular application with configurable options for API requests.

## Usage

```typescript
import { provideNgOpenapi } from "ng-openapi";
import { provideHttpClient } from "@angular/common/http";
import { ApplicationConfig } from "@angular/core";

export const appConfig: ApplicationConfig = {
    providers: [
        provideHttpClient(),
        provideNgOpenapi({
            basePath: "https://api.example.com",
        }),
    ],
};
```

## Configuration Options

### `basePath`

**Type:** `string` | **Required**

The base URL for your API. This is prepended to all API requests.

### `interceptors`

**Type:** `HttpInterceptor[]` | **Default:** `[]`

Apply client specific interceptors. This is not going to replace the global interceptors configured in your application, but will be applied to requests made by the provided client.

Interceptors can be re-used across different clients.

### `enableDateTransform`

**Type:** `boolean` | **Default:** `true`

If disabled, [Date Transformer Interceptor](utilities/date-transformer.md) will not be applied to the HTTP client. This means date strings will not be automatically converted to `Date` objects.

### `dateTransformRegex`

**Type:** `RegExp` | **Default:** [`ISO_DATE_REGEX`](utilities/date-transformer.md#recognized-formats)

Overrides the pattern the [Date Transformer Interceptor](utilities/date-transformer.md) uses to detect which string values are dates. Use it when your API returns a format the default pattern doesn't cover, without having to copy the generated `date-transformer.ts`. Only available when the client was generated with `dateType: 'Date'`.

```typescript
provideNgOpenapi({
    basePath: "https://api.example.com",
    dateTransformRegex: /your-custom-pattern/,
});
```

## Manual Configuration

If you prefer to manually configure the OpenAPI client without using the provider, you can do so by setting up the `BASE_PATH` token in the providers. This is useful for more complex scenarios where you need fine-grained control over the configuration.

```typescript
import { provideHttpClient } from "@angular/common/http";
import { ApplicationConfig } from "@angular/core";

export const appConfig: ApplicationConfig = {
    providers: [provideHttpClient(), { provide: BASE_PATH, useValue: "https://api.example.com" }],
};
```
