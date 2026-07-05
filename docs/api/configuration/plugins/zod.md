---
description: "ZodPlugin: generate Zod schemas from your OpenAPI spec for runtime validation."
title: Zod Plugin
---

# `ZodPlugin`

The `ZodPlugin` generates Zod schemas for your OpenAPI models, allowing for runtime validation of data structures in
your Angular applications.

:::warning Beta Feature
This plugin is still in beta and may contain bugs. Please [report any issues](https://github.com/ng-openapi/ng-openapi/issues) you encounter.
:::

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';
import { ZodPlugin } from '@ng-openapi/zod';

export default {
  plugins: [ZodPlugin], // top-level, not inside `options`
  ... // other configurations
} as GeneratorConfig;
```

## Notes

- Zod v3 is not supported.
