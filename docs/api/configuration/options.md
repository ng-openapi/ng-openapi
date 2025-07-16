---
title: Options
---

# `options`

**Type:** `object` | **Required**

Object containing various options to customize the code generation process.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    dateType: 'Date',
    enumStyle: 'enum',
    generateServices: true,
    generateEnumBasedOnDescription: false,
    customHeaders: {
      'Accept': 'application/json',
      ... // other headers
    },
    responseTypeMapping: {
      'application/pdf': 'blob',
      ... // other mappings
    },
    ... // other configurations
  }
};

export default config;
```

## Required Properties

- [dateType](options/date-type)
- [enumStyle](options/enum-style)

## Optional Properties

- [generateServices](options/generate-services)
- [generateEnumBasedOnDescription](options/generate-enums-description)
- [customHeaders](options/custom-headers)
- [responseTypeMapping](options/response-type-mapping)
- [customizeMethodName](options/customize-method-name)