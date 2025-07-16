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
├── models/
│   └── index.ts          # TypeScript interfaces
├── services/
│   ├── index.ts          # Service exports
│   └── pets.service.ts   # Generated service
├── tokens/
│   └── index.ts          # Injection tokens
├── utils/
│   ├── date-transformer.ts
│   └── file-download.ts
├── providers.ts          # Provider functions
└── index.ts              # Main exports
```