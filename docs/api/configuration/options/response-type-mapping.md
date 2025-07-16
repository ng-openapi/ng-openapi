---
title: Response Type Mapping
---

# `responseTypeMapping`

**Type:** `object | undefined` | **Default:** `undefined`

Maps specific MIME types to Angular's `HttpResponseType` to customize how different response types are handled in generated services.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    responseTypeMapping: {
      'application/pdf': 'blob',
      'application/json': 'json',
      'text/plain': 'text',
      // Add more mappings as needed
    },
  },
  ... // other configurations
};

export default config;
```

## Schema

```typescript
type ResponseTypeMapping = {
  [contentType: string]: "json" | "blob" | "arraybuffer" | "text";
};
```