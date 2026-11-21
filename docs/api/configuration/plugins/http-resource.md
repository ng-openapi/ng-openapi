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
- Resources are generated for read operations only — `GET`, and OpenAPI 3.2's `QUERY` — as suggested by [Angular's documentation ↗️](https://angular.dev/guide/http/http-resource); mutations stay on the generated services
- `QUERY` operations take their request body as an argument (a value or a signal) and require Angular 22.3+ — see [QUERY Operations](../../../guide/http-resource.md#query-operations)
- Generated resource classes honor [`serviceDecorator`](../options/service-decorator.md), so services and resources always use the same decorator
- Generated resource class names default to `<Tag>Resource` and can be decorated via [`naming.resources`](../options/naming.md); model references follow `naming.models`
