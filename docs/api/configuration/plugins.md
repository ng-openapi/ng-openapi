---
title: Plugins
---

# `plugins`
**Type:** `IPluginGenerator[]` | **Default: `undefined`**


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

## Available Plugins
- [HttpResourcePlugin](./plugins/http-resource.md)
- [ZodPlugin](./plugins/zod.md) (Beta)

## Notes
- This might become a public API in the future, allowing third-party plugins to be added