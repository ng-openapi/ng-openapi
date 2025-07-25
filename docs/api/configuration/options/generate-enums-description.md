---
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
  Value: number;
}
```

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

Generated enum:
```typescript
enum Status {
  Active = 0,
  Inactive = 1
}
```

## Notes

- If the description doesn't match the expected format, the generator falls back to using enum values directly