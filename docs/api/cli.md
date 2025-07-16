---
title: CLI
---

# CLI

Generate Angular services and TypeScript types from OpenAPI specifications using the command line interface.

## Usage

```bash
ng-openapi [command] [options]
```

## Commands

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

## Options

### Required Options

| Option | Alias | Description | Example |
|--------|-------|-------------|---------|
| `--config` | `-c` | Path to configuration file | `-c openapi.config.ts` |
| `--input` | `-i` | Path to OpenAPI specification | `-i swagger.json` |

### Output Options

| Option | Alias | Description | Default | Example |
|--------|-------|-------------|---------|---------|
| `--output` | `-o` | Output directory | `./src/generated` | `-o ./src/api` |

### Generation Options

| Option | Description | Default | Example |
|--------|-------------|---------|---------|
| `--types-only` | Generate only TypeScript interfaces | `false` | `--types-only` |
| `--date-type` | Date type to use | `Date` | `--date-type string` |

### Help and Version

| Option | Description |
|--------|-------------|
| `--help` | Show help information |
| `--version` | Show version number |

## Examples

```bash
# Generate from local file
ng-openapi -i ./swagger.json -o ./src/api

# Generate only types
ng-openapi -i swagger.json -o ./src/api --types-only

# Use string for dates
ng-openapi -i swagger.json -o ./src/api --date-type string

# Use configuration file
ng-openapi -c openapi.config.ts

# Generate with subcommand
ng-openapi generate -i swagger.json -o ./src/api
```