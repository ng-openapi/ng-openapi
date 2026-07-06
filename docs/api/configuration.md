---
description: "Complete GeneratorConfig reference with types and defaults for every property."
title: Configuration
---

# Configuration

Extensive configuration options to customize the generated output to match your needs.

## Usage

The `defineConfig` helper gives you full autocomplete and inline type errors without a manual annotation:

```typescript
// openapi.config.ts
import { defineConfig } from "ng-openapi";

export default defineConfig({
    input: "./swagger.json",
    output: "./src/api",
    options: {
        dateType: "Date",
        enumStyle: "enum",
    },
});
```

Annotating a plain object with the `GeneratorConfig` type works identically (and is the way to go on ng-openapi versions that don't ship `defineConfig` yet):

```typescript
// openapi.config.ts
import { GeneratorConfig } from "ng-openapi";

const config: GeneratorConfig = {
    input: "./swagger.json",
    output: "./src/api",
    options: {
        dateType: "Date",
        enumStyle: "enum",
    },
};

export default config;
```

## Properties at a Glance

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| [`input`](configuration/input.md) | `string` | ✅ | — | Path or URL of the OpenAPI/Swagger spec (`.json`, `.yaml`, `.yml`) |
| [`output`](configuration/output.md) | `string` | ✅ | — | Output directory for generated files |
| [`options`](configuration/options.md) | `object` | ✅ | — | Generation options — see [options overview](configuration/options.md) |
| [`clientName`](configuration/client-name.md) | `string` | — | `'default'` | Names the provider function and tokens; enables multiple clients per app |
| [`validateInput`](configuration/validate-input.md) | `(spec) => boolean` | — | `undefined` | Acceptance check on the parsed spec; `false` aborts generation |
| [`plugins`](configuration/plugins.md) | `IPluginGeneratorClass[]` | — | `undefined` | Plugin generators run after core generation |
| [`compilerOptions`](configuration/compiler-options.md) | `object` | — | `undefined` | ts-morph compiler settings for generation |

## Configuration Properties

### [Input](configuration/input.md)

**Type:** `string` | **Required**

Path or http(s) URL of your OpenAPI/Swagger specification.

### [Output](configuration/output.md)

**Type:** `string` | **Required**

Output directory for generated files.

### [Options](configuration/options.md)

**Type:** `object` | **Required**

Object containing various options to customize the code generation process.

### [Client Name](configuration/client-name.md)

**Type:** `string | undefined` | **Default:** `'default'`

Unique identifier for this client. Names the generated provider function (`provide<ClientName>Client`) and injection tokens, so multiple clients can coexist in one application.

### [Validate Input](configuration/validate-input.md)

**Type:** `(spec: SwaggerSpec) => boolean | undefined` | **Default:** `undefined`

Custom acceptance check run on the parsed specification; returning `false` aborts generation.

### [Plugins](configuration/plugins.md)

**Type:** `IPluginGeneratorClass[] | undefined` | **Default:** `undefined`

Plugin generator classes (e.g. `HttpResourcePlugin`, `ZodPlugin`), run after core generation.

### [Compiler Options](configuration/compiler-options.md)

**Type:** `object | undefined` | **Default:** `undefined`

TypeScript compiler options for the generated code.
