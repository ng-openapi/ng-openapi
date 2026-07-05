---
title: Output
---

# `output`

**Type:** `string` | **Required**

Output directory for generated files.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  input: './swagger.json',
  output: './src/client',
  ... // other configurations
};

export default config;
```

After generation, you'll have:

```
src/client/
├── models/               # TypeScript interfaces, enums
├── services/             # One Angular service per controller
├── tokens/               # Injection tokens
├── utils/                # Date transformer, download helpers, …
├── providers.ts          # Provider setup function
└── index.ts              # Main exports
```

## Notes

- The directory is created if it doesn't exist; generated files are overwritten on every run
- See [Generated Output](../../guide/generated-code.md) for a file-by-file tour
