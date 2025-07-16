---
title: Date Type
---

# `dateType`

**Type:** `string` | **Required**

Specifies how to handle date/datetime fields in the generated code.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    dateType: 'Date' // or 'string'
  },
  ... // other configurations
};

export default config;
```

## Supported Options

### `'Date'` (Default)
Generates date objects with [automatic transformation](../../utilities/date-transformer.md) for date and datetime fields.

```typescript
interface Event {
  id: number;
  name: string;
  date: Date; // Automatically transformed to Date object
}
```

### `'string'`
Generates string types for date and datetime fields without any transformation.

```typescript
interface Event {
  id: number;
  name: string;
  date: string; // No transformation, just a string
}
```

## Notes

- Using `'Date'` generates an HTTP Interceptor that automatically transforms date strings to `Date` objects
- The interceptor is included by default unless disabled in the [provider configuration](../../providers)