---
title: Schema Validation
---

# Schema Validation

Validate your API responses against the OpenAPI schema at runtime using any validation library, such as `zod`, `valibot`, `ajv`...etc.

## Overview

`httpResource` supports it natively using the `parse` option in its [options ↗️](https://angular.dev/guide/http/http-resource#response-parsing-and-validation).
The same option is now available for the generated `HttpClient` service methods. It works the same way, but it doesn't allow you to transform the response data.

## Example using Zod

Enable the response validation:

```typescript
// users-api.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  clientName: 'PetStore',
  input: 'https://petstore3.swagger.io/api/v3/openapi.json',
  output: './generated',
  options: {
    dateType: 'Date',
    enumStyle: 'enum',
    validation: {
      response: true,
    }
  }
};

export default config;
```

In your component use your zod schema in the `parse` option:
```typescript
// zod schema for the response
const getPetByIdResponse = z.object({
  "id": z.number().optional(),
  "name": z.string(),
  "category": z.object({
    "id": z.number().optional(),
    "name": z.string().optional()
  }).optional(),
  "photoUrls": z.array(z.string()),
  "tags": z.array(z.object({
    "id": z.number().optional(),
    "name": z.string().optional()
  })).optional(),
  "status": z.enum(['available', 'pending', 'sold']).optional().describe('pet status in the store')
})


@Component({
  templateUrl: './example-view.html',
})
export class ExampleView {
  readonly #petService = inject(PetService);
  readonly availablePets = toSignal(this.#petService.getPetById(1, undefined, {
    parse: getPetByIdResponse.parse // validate the response using zod
  }));
}
```