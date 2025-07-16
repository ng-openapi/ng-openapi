---
title: Input
---

# `input`

**Type:** `string` | **Required**

Path to your OpenAPI/Swagger specification file. Currently supports local files only.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  input: './swagger.json',
  ... // other configurations
};

export default config;
```

## Supported Formats

- **JSON**: `.json` files containing OpenAPI/Swagger specifications

## Notes

- File must contain a valid OpenAPI 2.0+ or Swagger specification
- Remote URLs must be accessible and return valid JSON/YAML content