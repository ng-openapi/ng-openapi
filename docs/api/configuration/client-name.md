---
description: "The clientName property: naming providers and tokens for multi-client setups."
title: Client Name
---

# `clientName`

**Type:** `string | undefined` | **Default:** `Default`

Unique identifier for the generated client code. This is used to differentiate between multiple clients in the same project.

Any string is accepted; an empty string means `default`. The name reaches three kinds of places:

- **Generated identifiers** (`provide<Name>Client`, `<Name>Config`, `<Name>BaseInterceptor`). A name that is already a valid TypeScript identifier is used as-is after capitalizing its first letter — `my_client` gives `provideMy_clientClient`, exactly as before. A name that is not (`my-client`, `my client`) has its non-identifier characters treated as word separators: `provideMyClientClient`.
- **Token names** (`BASE_PATH_<NAME>`, `CLIENT_CONTEXT_TOKEN_<NAME>`, `HTTP_INTERCEPTORS_<NAME>`). Every name, identifier-shaped or not, is upper-cased with each non-alphanumeric character replaced by `_` — so `my_client`, `my-client` and `my client` all produce `BASE_PATH_MY_CLIENT`. Two clients in one project need names that differ by more than punctuation or case.
- **Text** — the client context token's value and generated comments — where the value is kept verbatim and escaped.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  clientName: 'PetStore',
  ... // other configurations
};

export default config;
```

## Notes

- The generated [provider](../providers.md) will be named `provide<ClientName>Client`. Which then can be used in the `app.config.ts` file.
