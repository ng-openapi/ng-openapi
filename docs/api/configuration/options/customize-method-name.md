---
description: "customizeMethodName: derive service method names from operationIds."
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

This generates a method named `getPetById` in the `PetsService` instead of the default `petsGetPetById`.

## Notes

- `OperationId`s must be unique across the OpenAPI specification
- Usually includes the controller name and action name
- The customization function allows you to modify this to fit your naming conventions

## Return a valid identifier

Your function replaces the built-in conversion outright, so nothing sanitizes
its result. It must return a valid TypeScript identifier — letters, digits, `_`
and `$`, not starting with a digit — and not `constructor`, which is a valid
identifier but declares a class constructor rather than a method. Generation
fails with an `InvalidIdentifierError` naming the offending operation otherwise.

The same error is raised when an operation has no `operationId` at all, since
there is nothing to pass your function.

You do **not** need this option just to cope with awkward characters in an
`operationId`: the default conversion already drops anything illegal in an
identifier, so `groups_{group_id}_delete` becomes `groupsGroupIdDelete` on its
own.
