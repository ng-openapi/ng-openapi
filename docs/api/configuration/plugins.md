---
description: "Registering plugin generators like HttpResourcePlugin and ZodPlugin (top-level plugins array)."
title: Plugins
---

# `plugins`

**Type:** `IPluginGeneratorClass[]` | **Default: `undefined`**

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';
import { HttpResourcePlugin } from '@ng-openapi/http-resource';

export default {
  plugins: [HttpResourcePlugin],
  ... // other configurations
} as GeneratorConfig;
```

::: warning
`plugins` is a **top-level** configuration property, not part of `options`. A `plugins` array placed inside `options` is silently ignored.
:::

## Available Plugins

- [HttpResourcePlugin](./plugins/http-resource.md)
- [ZodPlugin](./plugins/zod.md) (Beta)

## Notes

- Third-party plugins can be written against the documented contract — see [Plugin Authoring](../../guide/plugin-authoring.md)
