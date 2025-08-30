---
title: Validation
---

# `validation`

**Type:** `{ response?: boolean } | undefined` | **Default:** `undefined`

When setting the `response` property to `true`, it enables runtime validation of API responses against the OpenAPI schema using a validation library of your choice (e.g., `zod`, `valibot`, `ajv`, etc.). 
This is particularly useful for ensuring that the data received from the server conforms to the expected structure, enhancing type safety and reducing runtime errors.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    validation: {
      response: true
    }
  },
  ... // other configurations
};

export default config;
```

After generation, you can use your preferred validation library in the `parse` option of the generated service methods to validate responses.

## Resources
- [HttpResource Parsing and Validation ↗️](https://angular.dev/guide/http/http-resource#response-parsing-and-validation)