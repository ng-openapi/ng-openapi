---
description: "modelFileStructure: generate one file per model instead of a single models/index.ts."
title: Model File Structure
---

# `modelFileStructure`

**Type:** `'single' | 'per-type' | undefined` | **Default:** `'single'`

Controls how the generated model declarations are laid out under `models/`. The default (`'single'`) keeps every interface, enum and type alias in one `models/index.ts`. With `'per-type'`, each schema gets its own file — easier to navigate for humans, and much friendlier to AI tooling that struggles with one huge file.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    modelFileStructure: 'per-type'
  },
  ... // other configurations
};

export default config;
```

## Example

With `'per-type'`, a spec with `Order`, `OrderStatus` and `User` schemas produces:

```
models/
├── index.ts             # Barrel: export * from "./order"; …
├── order.ts             # export interface Order { … }
├── order-status.ts      # export type OrderStatus = …
├── user.ts              # export interface User { … }
└── request-options.ts   # The RequestOptions SDK interface
```

File names are the kebab-cased raw schema names. Models referencing other models import them directly from the sibling file:

```typescript
// models/order.ts
import { OrderStatus } from "./order-status";

export interface Order {
    status: OrderStatus;
    ...
}
```

`models/index.ts` becomes a pure barrel, so consuming code is unaffected either way — generated services keep importing from `../models`, and everything is still re-exported from the client's main `index.ts`.

## Notes

- File names derive from the **undecorated** schema name: [`naming.models`](./naming) prefixes/suffixes decorate identifiers only, consistent with service file naming
- Two schemas whose names kebab-case to the same file name (e.g. `UserProfile` and `user_profile`) are disambiguated with a numeric suffix (`user-profile-2.ts`) and reported as a warning
- Schemas whose (decorated) **type names** collide — with each other, or with the built-in `RequestOptions` — produce TypeScript code that does not compile, in either file structure. Rename the schema or use [`naming.models`](./naming) to move the generated identifiers out of the way
- With [`useSingleRequestParameter`](./use-single-request-parameter), `models/request-params.ts` is generated and re-exported through the barrel exactly as in single-file mode
