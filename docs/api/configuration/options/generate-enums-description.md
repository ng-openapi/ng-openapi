---
description: "generateEnumBasedOnDescription: derive enum member names from JSON-encoded descriptions."
title: Generate Enums Based on Description
---

# `generateEnumBasedOnDescription`

**Type:** `boolean | undefined` | **Default:** `false`

When set to `true`, the generator parses enum values from the description field of the OpenAPI specification for more descriptive enum names.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    enumStyle: 'enum',
    generateEnumBasedOnDescription: true,
  },
  ... // other configurations
};

export default config;
```

## Description Format

The generator expects the description to be a JSON string of `EnumValueObject[]`:

```typescript
interface EnumValueObject {
    Name: string;
    Value: string | number;
}
```

Each entry names the `enum` member whose value equals `Value`.

### Example OpenAPI Enum with Description

```json
{
    "Status": {
        "enum": [0, 1],
        "type": "integer",
        "description": "[{\"Name\":\"Active\",\"Value\":0},{\"Name\":\"InActive\",\"Value\":1}]",
        "format": "int32"
    }
}
```

::: code-group

```typescript [enumStyle: 'enum']
export enum Status {
    Active = 0,
    InActive = 1,
}
```

```typescript [enumStyle: 'union']
export type Status = 0 | 1;
export const Status = {
    Active: 0 as Status,
    InActive: 1 as Status,
};
```

:::

## Notes

- The `enum` array stays the source of the values; the description only contributes names. Entries for values the enum does not have are ignored.
- A name that is a valid TypeScript identifier is used exactly as written. Any other name is converted the same way value-based names are.
- The description is used as a whole or not at all. If it is not JSON in the expected format, leaves an enum value without a name, or would give two members the same name, the generator falls back to naming the members after their values. It prints a warning when the description looks like JSON; a plain-text description falls back silently.
- With this option on, enum descriptions are not emitted as doc comments.
- If your spec carries the names in a vendor extension such as `x-enum-varnames` or `x-enumNames` instead, use [`enumNameExtensions`](enum-name-extensions). A matching extension wins when both options are set.
