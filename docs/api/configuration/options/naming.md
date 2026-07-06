---
description: "naming: prefix/suffix customization of generated service, resource and model identifiers."
title: Naming
---

# `naming`

**Type:** `NamingOptions | undefined` | **Default:** `undefined` (current names)

Decorates the identifiers of generated classes and types with a prefix and/or suffix, so generated API classes can't collide with your own (e.g. your hand-written `RoleService` vs the generated `ApiRoleService`). Services, `httpResource` classes, and models are configured independently:

```typescript
interface NamingOptions {
  services?:  { prefix?: string; suffix?: string };
  resources?: { prefix?: string; suffix?: string };
  models?:    { prefix?: string; suffix?: string };
}
```

- A **prefix** is prepended verbatim and must start a valid identifier (letters, digits, `_`).
- For **services and resources**, a suffix *replaces* the default `Service`/`Resource` suffix — `suffix: 'ApiService'` yields `RoleApiService`, and an empty string `''` drops the suffix entirely.
- For **models**, the suffix is plainly appended (models have no default suffix).
- **File names are unaffected** — `role.service.ts` keeps its name; only the exported identifiers change. Import through the generated barrels as usual.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    naming: {
      services: { prefix: 'Api' },
      models: { suffix: 'Dto' }
    }
  },
  ... // other configurations
};

export default config;
```

## Example

```typescript
// default
export class RoleService { ... }
export interface User { ... }
roleService.getUser(): Observable<User>

// naming: { services: { prefix: 'Api' }, models: { suffix: 'Dto' } }
export class ApiRoleService { ... }
export interface UserDto { ... }
apiRoleService.getUser(): Observable<UserDto>
```

## Notes

- Model decoration applies to **schema-derived types only** (interfaces, enums and aliases generated from spec schemas). Operation-derived names are untouched: request-params interfaces (`GetPetByIdParams`), zod schemas, and SDK types like `RequestOptions` keep their names
- Method parameter names derived from a body type follow the decorated name (e.g. a `User` body parameter named `user` becomes `userDto` with `models: { suffix: 'Dto' }`)
- The `resources` group only takes effect with the [HTTP Resource plugin](../plugins/http-resource)
- Prefixes/suffixes are validated as identifier fragments; anything else fails config validation
