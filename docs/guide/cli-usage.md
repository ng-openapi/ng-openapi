---
title: CLI Usage
---

# CLI Usage

Generate API clients using the ng-openapi command line interface.

## Basic Commands

### Direct Generation

```bash
ng-openapi -i swagger.json -o ./src/api
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

### Combined Options

```bash
ng-openapi -i swagger.json -o ./src/api --types-only --date-type string
```

## Configuration vs CLI

### Simple Generation

Use CLI options for quick generation:

```bash
ng-openapi -i swagger.json -o ./src/api --date-type Date
```

### Complex Generation

Use configuration file for advanced options:

```typescript
// openapi.config.ts
const config: GeneratorConfig = {
  input: './swagger.json',
  output: './src/api',
  options: {
    dateType: 'Date',
    customHeaders: { 'X-API-Key': 'key' },
    responseTypeMapping: { 'application/pdf': 'blob' }
  }
};
```

```bash
ng-openapi -c openapi.config.ts
```

## Package.json Integration

### Basic Scripts

```json
{
  "scripts": {
    "generate": "ng-openapi -c openapi.config.ts",
    "build": "npm run generate && ng build"
  }
}
```

### Multiple APIs

```json
{
  "scripts": {
    "generate:users": "ng-openapi -i users-api.json -o ./src/api/users",
    "generate:orders": "ng-openapi -i orders-api.json -o ./src/api/orders",
    "generate:all": "npm run generate:users && npm run generate:orders"
  }
}
```

## Help and Version

### Get Help

```bash
ng-openapi --help
ng-openapi generate --help
```

### Check Version

```bash
ng-openapi --version
```

## Resources

- [CLI Reference](../api/cli.md)
- [Configuration Options](../api/configuration.md)