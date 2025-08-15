---
title: Http Resource Plugin
---

# `HttpResourcePlugin`

The HTTP Resource plugin generates Angular services using the experimental `httpResource` API for automatic caching, state management, and reactive data loading.

:::warning Experimental Feature
`httpResource` is still experimental in Angular. Use with caution in production environments.

[Learn more in Angular Docs ↗️](https://angular.dev/guide/http/http-resource)
:::

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

export default {
  options: {
    plugins: [HttpResourcePlugin],
  },
  ... // other configurations
} as GeneratorConfig;
```

## Notes
- Scoped interceptors are applied for resources as well
- Currently only supports `GET` methods, as suggested by [Angular's documentation ↗️](https://angular.dev/guide/http/http-resource)