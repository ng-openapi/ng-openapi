---
title: Client Name
---

# `clientName`

**Type:** `string | undefined` | **Default:** `Default`

Unique identifier for the generated client code. This is used to differentiate between multiple clients in the same project.

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