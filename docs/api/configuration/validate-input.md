---
title: Validate Input
---

# `validateInput`

**Type:** `Function | undefined` | **Default:** `undefined`

**Signature:** `(spec: SwaggerSpec) => boolean`

Custom validation function to conditionally allow client generation based on the OpenAPI/Swagger specification. This is particularly useful when using URLs as input to avoid generation mistakes or ensure specification quality.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  input: 'https://api.example.com/swagger.json',
  validateInput: (spec) => {
    // Example validation: check if the title matches a specific value
    return spec.info.title === "Swagger Petstore - OpenAPI 3.0";
  },
  ... // other configurations
};

export default config;
```

## Parameters

- **spec**: The parsed OpenAPI/Swagger specification object

## Return Value

- **boolean**: `true` to proceed with generation, `false` to stop generation

## Notes
- Useful for remote URLs where specification content may vary, especially in development or local environments