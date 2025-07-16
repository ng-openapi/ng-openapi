---
title: Generate Services
---

# `generateServices`

**Type:** `boolean | undefined` | **Default:** `true`

When set to `false`, the generator skips generating Angular services, producing only TypeScript types and interfaces.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    generateServices: false
  },
  ... // other configurations
};

export default config;
```

After generation, you'll have:

```
src/client/
├── models/
│   └── index.ts          # TypeScript interfaces
└── index.ts              # Main exports
```

## Notes

- If services are not generated, the related utilities and providers will also not be generated