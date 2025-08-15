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

## Notes
- Currently, there is only one plugin available: [HttpResourcePlugin](./plugins/http-resource.md)
- This might become a public API in the future, allowing third-party plugins to be added