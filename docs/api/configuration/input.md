---
title: Input
---

# `input`

**Type:** `string` | **Required**

Path or http(s) URL of your OpenAPI/Swagger specification.

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

Remote specifications work the same way:

```typescript
const config: GeneratorConfig = {
  input: 'https://api.example.com/openapi.yaml',
  ... // other configurations
};
```

## Supported Formats

- **JSON**: `.json` files containing OpenAPI/Swagger specifications
- **YAML**: `.yaml` / `.yml` files containing OpenAPI/Swagger specifications
- **URLs**: `http(s)` URLs returning any of the above

## Notes

- The specification must be a valid Swagger 2.x or OpenAPI 3.x document
- Remote URLs must be accessible and return valid JSON/YAML content
- Consider [`validateInput`](./validate-input.md) to guard against unexpected spec changes when generating from a URL
