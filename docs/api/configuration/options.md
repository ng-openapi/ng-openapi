---
description: "All options.* generation options at a glance, with types and defaults."
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

## Options at a Glance

| Option | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| [`dateType`](options/date-type) | `'string' \| 'Date'` | ✅ | — | How date/date-time fields are typed (and whether the date interceptor is generated) |
| [`enumStyle`](options/enum-style) | `'enum' \| 'union'` | ✅ | — | Emit TypeScript enums or literal-union types |
| [`generateServices`](options/generate-services) | `boolean` | — | `true` | Set `false` to generate models only |
| [`validation`](options/validation) | `{ response?: boolean }` | — | `undefined` | Adds a `parse` hook to service methods for runtime response validation |
| [`generateEnumBasedOnDescription`](options/generate-enums-description) | `boolean` | — | `false` | Read enum member names from JSON-encoded descriptions |
| [`customHeaders`](options/custom-headers) | `Record<string, string>` | — | `undefined` | Default headers added to every request |
| [`emitAcceptHeader`](options/emit-accept-header) | `boolean` | — | `true` | Send an `Accept` header derived from each operation's response content types |
| [`responseTypeMapping`](options/response-type-mapping) | `Record<string, ResponseType>` | — | `undefined` | Pin the Angular `responseType` per content type |
| [`customizeMethodName`](options/customize-method-name) | `(operationId) => string` | — | `undefined` | Derive method names from `operationId`s |
| [`useSingleRequestParameter`](options/use-single-request-parameter) | `boolean` | — | `false` | One request object per method instead of positional parameters |
| [`serviceDecorator`](options/service-decorator) | `'injectable' \| 'service'` | — | `'injectable'` | Emit Angular 22+'s `@Service()` instead of `@Injectable({ providedIn: 'root' })` |
| [`naming`](options/naming) | `NamingOptions` | — | `undefined` | Prefix/suffix decoration of generated service, resource and model identifiers |
| [`modelFileStructure`](options/model-file-structure) | `'single' \| 'per-type'` | — | `'single'` | Keep all models in one `models/index.ts` or write one file per schema |
