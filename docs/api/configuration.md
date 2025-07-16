---
title: Configuration
---

# Configuration

Extensive configuration options to customize the generated output to match your needs.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  input: './swagger.json',
  output: './src/api',
  options: {
    dateType: 'Date',
    enumStyle: 'enum',
  }
};

export default config;
```

## Configuration Properties

### [Input](configuration/input.md)
**Type:** `string` | **Required**

Path to your OpenAPI/Swagger specification file.

### [Output](configuration/output.md)
**Type:** `string` | **Required**

Output directory for generated files.

### [Options](configuration/options.md)
**Type:** `object` | **Required**

Object containing various options to customize the code generation process.

### [Compiler Options](configuration/compiler-options.md)
**Type:** `object | undefined` | **Default:** `undefined`

TypeScript compiler options for the generated code.