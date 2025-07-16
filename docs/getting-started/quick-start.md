---
title: Quick Start
---

# Quick Start

Generate Angular services and TypeScript types from your OpenAPI specification.

## Step 1: Prepare Your OpenAPI Specification

You need an OpenAPI/Swagger specification file:
- JSON file (`swagger.json`, `openapi.json`)

## Step 2: Generate API Client

### Using Command Line

```bash
ng-openapi -i ./swagger.json -o ./src/api
```

### Using Configuration File

Create `openapi.config.ts`:

```typescript
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  input: './swagger.json',
  output: './src/client',
  options: {
    dateType: 'Date',
    enumStyle: 'enum'
  }
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
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideNgOpenapi } from './api/providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideNgOpenapi({
      basePath: 'https://api.example.com'
    })
  ]
};
```

## Step 4: Use Generated Services

```typescript
import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { PetsService } from './api/services';
import { Pet } from './api/models';

export class PetsComponent {
  private readonly petsService = inject(PetsService);
  readonly pets = toSignal(this.petsService.listPets());
}
```

## Generated Structure

After generation, you'll have:

```
src/api/
├── models/
│   └── index.ts          # TypeScript interfaces
├── services/
│   ├── index.ts          # Service exports
│   └── pets.service.ts   # Generated service
├── tokens/
│   └── index.ts          # Injection tokens
├── utils/
│   ├── date-transformer.ts
│   └── file-download.ts
├── providers.ts          # Provider functions
└── index.ts             # Main exports
```