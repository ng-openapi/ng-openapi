---
description: "enumNameExtensions: name enum members from vendor extensions such as x-enum-varnames and x-enumNames."
title: Enum Name Extensions
---

# `enumNameExtensions`

**Type:** `string[] | undefined` | **Default:** `undefined`

OpenAPI stores enum values, not member names, so an integer enum generates as `_0`, `_1`, `_2`. Many spec generators add the names in a vendor extension next to `enum`. This option lists the extensions `ng-openapi` reads them from.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    enumStyle: 'enum',
    enumNameExtensions: ['x-enum-varnames', 'x-enumNames'],
  },
  ... // other configurations
};

export default config;
```

Every entry must start with `x-`. Common ones:

| Extension         | Written by                      |
| ----------------- | ------------------------------- |
| `x-enumNames`     | NSwag, NJsonSchema (ASP.NET)    |
| `x-enum-varnames` | OpenAPI Generator, oapi-codegen |

Any other extension works the same way, as long as it holds one name per enum value.

## Example

```json
{
    "SyncMode": {
        "type": "integer",
        "enum": [0, 1, 2],
        "x-enumNames": ["Unknown", "Full", "Delta"]
    }
}
```

::: code-group

```typescript [enumStyle: 'enum']
export enum SyncMode {
    Unknown = 0,
    Full = 1,
    Delta = 2,
}
```

```typescript [enumStyle: 'union']
export type SyncMode = 0 | 1 | 2;
export const SyncMode = {
    Unknown: 0 as SyncMode,
    Full: 1 as SyncMode,
    Delta: 2 as SyncMode,
};
```

:::

String enums are named the same way.

## How Names Are Resolved

- The extensions are checked in the order you list them. The first one the schema has, with exactly one string per `enum` value, names the members.
- A name that is a valid TypeScript identifier is used exactly as written, so `STATUS_ACTIVE` stays `STATUS_ACTIVE`. Any other name is converted the same way value-based names are (`"two words"` becomes `TwoWords`).
- An extension is used as a whole or not at all. If it is not an array of strings, has the wrong length, or would give two members the same name, the generator prints a warning and moves on to the next source. With no usable source, the members are named after their values as usual.
- A matching extension wins over [`generateEnumBasedOnDescription`](generate-enums-description) when both are set.

## Notes

- The names apply to named schemas (`components.schemas` / `definitions`). An enum written inline on a property generates a literal union, which has no member names.
- Turning the option on renames the members of every enum that carries one of the listed extensions (`SyncMode._0` becomes `SyncMode.Unknown`), so code that references the old names has to be updated.
