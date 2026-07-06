---
description: "Generate a type-safe Angular API client from an OpenAPI spec in four steps."
title: Quick Start
---

# Quick Start

Generate Angular services and TypeScript types from your OpenAPI specification.

## Step 1: Prepare Your OpenAPI Specification

You need an OpenAPI/Swagger specification file:

- JSON file (`swagger.json`, `openapi.json`)
- Yaml file (`swagger.yml`, `openapi.yaml`)

## Step 2: Generate API Client

### Using Command Line

```bash
ng-openapi -i ./swagger.json -o ./src/api
```

### Using Configuration File

Create `openapi.config.ts`:

```typescript
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

Then run:

```bash
ng-openapi -c openapi.config.ts
```

## Step 3: Configure Your Angular App

Add the provider to your `app.config.ts`:

```typescript
import { ApplicationConfig } from "@angular/core";
import { provideHttpClient } from "@angular/common/http";
import { provideDefaultClient } from "./api/providers";

export const appConfig: ApplicationConfig = {
    providers: [
        provideHttpClient(),
        provideDefaultClient({
            basePath: "https://api.example.com",
        }),
    ],
};
```

## Step 4: Use Generated Services

```typescript
import { inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { PetsService } from "./api/services";
import { Pet } from "./api/models";

export class PetsComponent {
    private readonly petsService = inject(PetsService);
    readonly pets = toSignal(this.petsService.listPets());
}
```

## Generated Structure

After generation, you'll have:

```
src/api/
├── models/               # TypeScript interfaces, enums
├── services/             # One Angular service per controller
├── tokens/               # Injection tokens
├── utils/                # Date transformer, download helpers, …
├── providers.ts          # provideDefaultClient() setup function
└── index.ts              # Main exports
```

See [Generated Output](../guide/generated-code.md) for what every file does.

## Next Steps

- [Configuration Reference](../api/configuration.md) — all generator options at a glance
- [Angular Integration](../guide/angular-integration.md) — providers, interceptors, environments
- [Multiple Clients](../guide/multiple-clients.md) — several APIs in one app
- [Schema Validation](../guide/schema-validation.md) — validate responses at runtime
