---
title: Customize Method Name
---

# `customizeMethodName`

**Type:** `Function | undefined` | **Default:** `undefined`

**Signature:** `(operationId: string) => string`

Provides a custom function to modify how method names are generated based on the `operationId` from the OpenAPI specification.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    customizeMethodName: (operationId: string) => {
      const methodName = operationId.split('_').pop() ?? operationId;
      return methodName.charAt(0).toLowerCase() + methodName.slice(1);
    }
  },
  ... // other configurations
};

export default config;
```

Given an OpenAPI spec like this:

```json
{
  "/api/pets/{id}": {
    "get": {
      "tags": ["Pets"],
      "operationId": "Pets_GetPetById"
      ... // other properties
    }
  }
}
```

This generates a method named `getPetById` in the `PetsService` instead of the default `Pets_GetPetById`.

## Notes

- `OperationId`s must be unique across the OpenAPI specification
- Usually includes the controller name and action name
- The customization function allows you to modify this to fit your naming conventions