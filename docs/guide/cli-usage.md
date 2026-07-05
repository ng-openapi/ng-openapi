---
title: CLI Usage
---

# CLI Usage

Generate API clients using the ng-openapi command line interface. This page covers day-to-day workflows; the complete flag list lives in the [CLI reference](../api/cli.md).

## Basic Commands

### Direct Generation

```bash
ng-openapi -i swagger.json -o ./src/api
```

The input can also be a URL:

```bash
ng-openapi -i https://api.example.com/openapi.yaml -o ./src/api
```

### Configuration File

```bash
ng-openapi -c openapi.config.ts
```

### Generate Subcommand

```bash
ng-openapi generate -i swagger.json -o ./src/api
ng-openapi gen -c openapi.config.ts  # Short alias
```

## Common Options

### Types Only

```bash
ng-openapi -i swagger.json -o ./src/api --types-only
```

### String Dates

```bash
ng-openapi -i swagger.json -o ./src/api --date-type string
```

## Configuration vs CLI

CLI flags cover the quick cases; everything else (headers, plugins, method naming, validation, …) needs a [configuration file](../api/configuration.md):

```typescript
// openapi.config.ts
import { GeneratorConfig } from "ng-openapi";

const config: GeneratorConfig = {
    input: "./swagger.json",
    output: "./src/api",
    options: {
        dateType: "Date",
        enumStyle: "enum",
        customHeaders: { "X-API-Key": "key" },
        responseTypeMapping: { "application/pdf": "blob" },
    },
};

export default config;
```

```bash
ng-openapi -c openapi.config.ts
```

## Workflow Recipes

### Generate Before Serving/Building

```json
{
    "scripts": {
        "generate:client": "ng-openapi -c openapi.config.ts",
        "dev": "npm run generate:client && ng serve",
        "prebuild": "npm run generate:client",
        "build": "ng build"
    }
}
```

### Regenerate on Spec Changes

```json
{
    "scripts": {
        "generate:watch": "nodemon --watch swagger.json --exec 'npm run generate:client'"
    }
}
```

### Fetch the Spec First

```json
{
    "scripts": {
        "fetch:spec": "curl https://api.example.com/swagger.json > swagger.json",
        "generate:client": "npm run fetch:spec && ng-openapi -c openapi.config.ts"
    }
}
```

Alternatively, point `input` directly at the URL and use [`validateInput`](../api/configuration/validate-input.md) to guard against unexpected spec changes.

### Multiple APIs

```json
{
    "scripts": {
        "generate:users": "ng-openapi -c users-api.config.ts",
        "generate:orders": "ng-openapi -c orders-api.config.ts",
        "generate:all": "npm run generate:users && npm run generate:orders"
    }
}
```

See [Multiple Clients](./multiple-clients.md) for the full setup.

## Help and Version

```bash
ng-openapi --help
ng-openapi generate --help
ng-openapi --version
```

## Resources

- [CLI Reference](../api/cli.md) — all flags and defaults
- [Configuration Reference](../api/configuration.md) — all config-file properties
- [Generated Output](./generated-code.md) — what lands in your output directory
