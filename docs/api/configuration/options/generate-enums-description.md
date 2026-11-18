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

Each entry names the `enum` member whose value equals `Value`. A number and its text form match each other, so `"Value": "1"` names the enum value `1`.

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
- A value can have several names, as .NET enum aliases do (`Light = 1, Pale = 1`). When the `enum` array repeats the value (`[1, 1, 2]`), each occurrence takes the next entry with that `Value`, so both members are generated. When the array lists the value once, the first name is used and the others are dropped with a warning.
- A description in which no entry matches any enum value is left alone without a warning. This is the case for string enums whose description lists the numeric backing values (`enum: ["Active", "Inactive"]` with `"Value": 0` and `"Value": 1`).
- A name that is a valid TypeScript identifier is used exactly as written. Any other name is converted the same way value-based names are.
- The description is used as a whole or not at all. If it is not JSON in the expected format, names some enum values but not all of them, or would give two members the same name, the generator falls back to naming the members after their values. It prints a warning when the description is JSON of the wrong shape or starts like the expected list (`[{`) but does not parse; any other text, such as `[Deprecated] use X`, is treated as a plain description and falls back silently.
- Only enums of strings and numbers are named. An enum that lists `null` among its values (a nullable enum) keeps none of the names.
- Running the CLI with `--input` and no configuration file turns this option on.
- With this option on, enum descriptions are not emitted as doc comments.
- If your spec carries the names in a vendor extension such as `x-enum-varnames` or `x-enumNames` instead, use [`enumNameExtensions`](enum-name-extensions). A matching extension wins when both options are set.
