---
title: Use Single Request Parameter
---

# `useSingleRequestParameter`

**Type:** `boolean | undefined` | **Default:** `false`

Generates service methods that take a single request object instead of one positional parameter per path/query/body parameter. Each operation gets a named, exported interface (e.g. `GetPetByIdParams`) containing all of its parameters, exported from `models/request-params.ts`.

This makes call sites order-independent: adding a new parameter in the middle of an operation no longer silently shifts positional arguments.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    useSingleRequestParameter: true
  },
  ... // other configurations
};

export default config;
```

## Example

Given an operation `GET /pet/{petId}` with a required `petId` path parameter and an optional `verbose` query parameter, the generated method changes from:

```typescript
// useSingleRequestParameter: false (default)
petService.getPetById(1, true).subscribe();
```

to:

```typescript
// useSingleRequestParameter: true
import { GetPetByIdParams } from './api/models';

const request: GetPetByIdParams = { petId: 1, verbose: true };
petService.getPetById(request).subscribe();
```

The request parameter contains **all** operation parameters: path parameters, query parameters, the JSON request body, and multipart/url-encoded form fields. The trailing `observe` and `options` parameters are unaffected.

## Notes

- Operations without any parameters keep their signature unchanged and get no interface
- If all parameters of an operation are optional, the request object itself is optional
- Interface names are derived from the (possibly customized) method name: `getPetById` → `GetPetByIdParams`. If two services share a method name, the second interface is prefixed with the service name (e.g. `AdminGetPetByIdParams`)
- All interfaces are re-exported through the `models` barrel
- Operation parameters named `observe` or `options` conflict with the reserved trailing method parameters and cause a generation error when this option is enabled
