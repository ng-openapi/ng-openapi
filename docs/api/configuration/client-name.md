---
description: "The clientName property: naming providers and tokens for multi-client setups."
title: Client Name
---

# `clientName`

**Type:** `string | undefined` | **Default:** `Default`

Unique identifier for the generated client code. This is used to differentiate between multiple clients in the same project.

Any string is accepted. Characters that cannot appear in a TypeScript identifier are treated as word separators where the name is spliced into generated identifiers (`my-client` yields `MyClientBaseInterceptor` and `BASE_PATH_MY_CLIENT`); the raw value is kept where it is only a string, such as the client context token.

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
