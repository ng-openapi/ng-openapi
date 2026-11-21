---
description: "The input property: local JSON/YAML spec files or http(s) URLs."
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
- From OpenAPI 3.2, `query` operations (the HTTP `QUERY` method) are generated — they require Angular 22.3+, see [Generated Output](../../guide/generated-code.md#services-service-ts). `in: querystring` parameters and `itemSchema` are not supported yet
- Remote URLs must be accessible and return valid JSON/YAML content
- A `$ref` into a property of a schema (`#/components/schemas/X/properties/y`) is inlined; deep pointers into other parts of the document are passed through with a warning — see [Schema References](../../guide/generated-code.md#schema-references)
- Consider [`validateInput`](./validate-input.md) to guard against unexpected spec changes when generating from a URL
