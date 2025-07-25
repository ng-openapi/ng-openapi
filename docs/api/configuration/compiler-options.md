---
title: Compiler Options
---

# `compilerOptions`

**Type:** `object | undefined` | **Default:** `undefined`

TypeScript compiler options for the generated code.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  compilerOptions: {
    declaration: true,
    target: ScriptTarget.ES2022,
    module: ModuleKind.Preserve,
    strict: true
  },
  ... // other configurations
};

export default config;
```

## Schema

```typescript
type CompilerOptions = {
  declaration?: boolean;
  target?: ScriptTarget;
  module?: ModuleKind;
  strict?: boolean;
};
```

## Notes

- When not specified, the generator uses default Angular TypeScript compiler settings