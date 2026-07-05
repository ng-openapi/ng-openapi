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

- Third-party plugins can be written against the documented contract — see [Plugin Authoring](../../guide/plugin-authoring.md)
