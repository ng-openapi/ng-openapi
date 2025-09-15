<div align="center">
  <h1 align="center"><img src="https://raw.githubusercontent.com/ng-openapi/ng-openapi/HEAD/docs/public/ng-openapi-logo.svg" alt="Logo" style="height: 12vh; margin-bottom: 2vh;" width="160"></h1>
  <h1 align="center"><b>Zod Plugin</b></h1>
  <p align="center">🚀 Zod schema generator plugin for <a href="https://www.npmjs.com/package/ng-openapi">ng-openapi</a></p>
</div>

<p align="center">
  <a href="https://stackblitz.com/@Mr-Jami/collections/ng-openapi-examples">⚡Examples</a>
  <span>&nbsp;•&nbsp;</span>
  <a href="https://ng-openapi.dev/">📝Documentation</a>
  <span>&nbsp;•&nbsp;</span>
  <a href="https://github.com/ng-openapi/ng-openapi/issues">🐛Issues</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ng-openapi/zod" rel="nofollow"><img src="https://img.shields.io/npm/v/@ng-openapi/zod.svg" alt="npm version"></a>
  <a href="https://opensource.org/license/mit" rel="nofollow"><img src="https://img.shields.io/github/license/ng-openapi/ng-openapi" alt="MIT License"></a>
  <a href="https://github.com/ng-openapi/ng-openapi/actions?query=branch%3Amain"><img src="https://img.shields.io/github/last-commit/ng-openapi/ng-openapi" alt="Last commit" /></a>
  <a href="https://github.com/ng-openapi/ng-openapi/actions?query=branch%3Amain"><img src="https://github.com/ng-openapi/ng-openapi/actions/workflows/release.yml/badge.svg?event=push&branch=main" alt="CI status" /></a>
</p>
<br/>

## What is Zod Plugin?

tbd.

## Installation

```bash
npm install @ng-openapi/zod ng-openapi --save-dev
```

## Quick Start

### 1. Configure Plugin

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';
import { HttpResourcePlugin } from '@ng-openapi/zod';

export default {
  input: './swagger.json',
  output: './src/api',
  clientName: 'NgOpenApi',
  plugins: [HttpResourcePlugin],
} as GeneratorConfig;
```

### 2. Generate Resources

```bash
ng-openapi -c openapi.config.ts
```

### 3. Setup Providers

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideDefaultClient } from './api/providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideNgOpenApiClient({
      basePath: 'https://api.example.com'
    })
  ]
};
```

### 4. Use Generated Resources

```typescript
import { Component, inject } from '@angular/core';
import { UsersResource } from './api/resources';

@Component({
  selector: 'app-users',
  template: `
    <div>
      @if (users.isLoading()) {
        <p>Loading...</p>
      }
      @if (users.error()) {
        <p>Error: {{ users.error() }}</p>
      }
      @for (user of users.value(); track user.id) {
        <div>{{ user.name }}</div>
      }
    </div>
  `
})
export class UsersComponent {
  private readonly usersResource = inject(UsersResource);
  
  // Automatic caching and reactive updates
  readonly users = this.usersResource.getUsers();
}
```

## Generated Structure

```
src/api/
├── models/           # TypeScript interfaces
├── resources/        # HTTP Resource services
│   ├── index.ts      # Resource exports
│   └── *.resource.ts # Generated resources
├── services/         # Traditional HttpClient services
├── providers.ts      # Provider functions
└── index.ts         # Main exports
```

## Documentation

- 📖 [Full Documentation](https://ng-openapi.dev/plugins/zod)
- 🚀 [Live Examples](https://stackblitz.com/@Mr-Jami/collections/ng-openapi-examples)