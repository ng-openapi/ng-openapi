---
description: "The clientName property: naming providers and tokens for multi-client setups."
title: Client Name
---

# `clientName`

**Type:** `string | undefined` | **Default:** `Default`

Unique identifier for the generated client code. This is used to differentiate between multiple clients in the same project.

Any string is accepted; an empty string means `default`. A name that is already a valid TypeScript identifier is used as-is where it becomes part of a generated identifier — `my_client` gives `provideMy_clientClient`, exactly as before. A name that is not (`my-client`, `my client`) has its non-identifier characters treated as word separators there (`provideMyClientClient`, `MyClientBaseInterceptor`) and becomes upper-snake in token names (`BASE_PATH_MY_CLIENT`). Wherever the value is only text — the client context token's value, generated comments — it is kept verbatim and escaped.

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
