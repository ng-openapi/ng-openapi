---
title: Providers
---

# Providers

The `provideNgOpenapi` function sets up the OpenAPI client in your Angular application with configurable options for API requests.

## Usage

```typescript
import { provideNgOpenapi } from 'ng-openapi';
import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideNgOpenapi({
      basePath: 'https://api.example.com'
    })
  ]
};
```

## Configuration Options

### `basePath`
**Type:** `string` | **Required**

The base URL for your API. This is prepended to all API requests.

### `enableDateTransform`
**Type:** `boolean` | **Default:** `true`

If disabled, [Date Transformer Interceptor](utilities/date-transformer.md) will not be applied to the HTTP client. This means date strings will not be automatically converted to `Date` objects.

## Manual Configuration

If you prefer to manually configure the OpenAPI client without using the provider, you can do so by setting up the `BASE_PATH` token in the providers. This is useful for more complex scenarios where you need fine-grained control over the configuration.

```typescript
import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    { provide: BASE_PATH, useValue: 'https://api.example.com' }
  ]
};
```