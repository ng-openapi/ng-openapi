---
title: Enum Style
---

# `enumStyle`

**Type:** `string` | **Required**

Specifies how to generate enum types in the generated code. Can be either a TypeScript `enum` or a union type.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    enumStyle: 'enum' // or 'union'
  },
  ... // other configurations
};

export default config;
```

## Supported Options

### `'enum'` (Default)
Generates TypeScript `enum` types for enumerations.

```typescript
// Example enum with integer values
enum Status {
  _0 = 0,
  _1 = 1
}

// Example enum with string values
enum Status {
  Active = 'active',
  Inactive = 'inactive'
}
```

### `'union'`
Not supported yet, but will generate union types for enumerations in the future.

## Notes

- OpenAPI only stores enum values, not names. The generator creates TypeScript enums with names based on values
- If your OpenAPI spec contains a description for the `enum` object, `ng-openapi` can generate [enums based on that description](generate-enums-description)