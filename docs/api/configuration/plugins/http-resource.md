---
description: "HttpResourcePlugin: generate signal-based httpResource services from your OpenAPI spec."
title: Http Resource Plugin
---

# `HttpResourcePlugin`

The HTTP Resource plugin generates Angular services using the `httpResource` API for automatic caching, state management, and reactive data loading.

[Learn more in Angular Docs ↗️](https://angular.dev/guide/http/http-resource)

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';
import { HttpResourcePlugin } from '@ng-openapi/http-resource';

export default {
  plugins: [HttpResourcePlugin], // top-level, not inside `options`
  ... // other configurations
} as GeneratorConfig;
```

## Notes

- Scoped interceptors are applied for resources as well
- Currently only supports `GET` methods, as suggested by [Angular's documentation ↗️](https://angular.dev/guide/http/http-resource)
