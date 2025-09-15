---
title: Zod Plugin
---

# `ZodPlugin`

The `ZodPlugin` generates Zod schemas for your OpenAPI models, allowing for runtime validation of data structures in
your Angular applications.

:::warning Beta Feature
Since this plugin is released pre-planned. It might contain bugs. Please report any issues you encounter.
:::

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';
import { ZodPlugin } from '@ng-openapi/zod';

export default {
  options: {
    plugins: [ZodPlugin],
  },
  ... // other configurations
} as GeneratorConfig;
```

## Notes

- Zod v3 is not supported.