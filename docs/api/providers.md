---
title: Providers
---

# Providers

The `provideNgOpenapi` function sets up the OpenAPI client in your Angular application with configurable options for API requests.

## Usage

```typescript
import { provideNgOpenapi } from "./client/providers";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { ApplicationConfig } from "@angular/core";
import { defaultBaseInterceptor } from "./client/utils/base-interceptor";

export const appConfig: ApplicationConfig = {
    providers: [
        provideHttpClient(withInterceptors([defaultBaseInterceptor])),
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

**Type:** `HttpInterceptor` classes | **Default:** `[]`

Apply client specific interceptors. This is not going to replace the global interceptors configured in your application, but will be applied to requests made by the provided client.

Interceptors can be re-used across different clients.

The generated scoped interceptor is also available as a class for DI-based registration. Standalone applications should prefer the generated functional interceptor with `withInterceptors([...])`; DI-based setups can use `withInterceptorsFromDi()`.

### `enableDateTransform`

**Type:** `boolean` | **Default:** `true`

If disabled, [Date Transformer Interceptor](utilities/date-transformer.md) will not be applied to the HTTP client. This means date strings will not be automatically converted to `Date` objects.

## Manual Configuration

If you prefer to manually configure the OpenAPI client without using the provider, you can do so by setting up the `BASE_PATH` token in the providers. This is useful for more complex scenarios where you need fine-grained control over the configuration.

```typescript
import { provideHttpClient } from "@angular/common/http";
import { ApplicationConfig } from "@angular/core";

export const appConfig: ApplicationConfig = {
    providers: [provideHttpClient(), { provide: BASE_PATH, useValue: "https://api.example.com" }],
};
```
