---
title: HTTP Resource Plugin
---

# HTTP Resource Plugin

Generate Angular services using the experimental `httpResource` API for automatic caching, state management, and reactive data loading.

:::warning Experimental Feature
`httpResource` is still experimental in Angular. Use with caution in production environments.
:::

## Overview

The HTTP Resource plugin extends ng-openapi to generate services that leverage Angular's new `httpResource` API instead of traditional `HttpClient`. This provides built-in caching, loading states, error handling, and reactive updates through Angular Signals.

## Installation

Install the plugin alongside ng-openapi:

```bash
npm install ng-openapi @ng-openapi/http-resource --save-dev
```

## Configuration

Add the plugin to your OpenAPI configuration:

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';
import { HttpResourceGenerator } from '@ng-openapi/http-resource';

export default {
  input: './swagger.json',
  output: './src/api',
  clientName: 'MyApi',
  plugins: [HttpResourcePlugin],
  options: {
    dateType: 'Date',
    enumStyle: 'enum'
  }
} as GeneratorConfig;
```


## Generation

Generate your API resources:

```bash
ng-openapi -c openapi.config.ts
```

This creates both traditional services and HTTP resource services:

```
src/api/
├── models/           # TypeScript interfaces
├── services/         # Traditional HttpClient services
├── resources/        # HTTP Resource services
│   ├── index.ts      # Resource exports
│   └── *.resource.ts # Generated resources
├── providers.ts      # Provider functions
└── index.ts         # Main exports
```

## Provider Setup

Configure the provider in your application:

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideMyApiClient } from './api/providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideMyApiClient({
      basePath: 'https://api.example.com'
    })
  ]
};
```

## Basic Usage

Inject and use the generated resources in your components:

```typescript
import { Component, inject } from '@angular/core';
import { UsersResource } from './api/resources';

@Component({
  selector: 'app-users',
  template: `
    <div>
      @if (users.isLoading()) {
        <p>Loading users...</p>
      } @else if (users.error()) {
        <p>Error: {{ users.error()?.message }}</p>
      } @else {
        @for (user of users.value(); track user.id) {
          <div>{{ user.name }}</div>
        }
      }
    </div>
  `
})
export class UsersComponent {
  private readonly usersResource = inject(UsersResource);
  
  readonly users = this.usersResource.getUsers();
}
```

## Dynamic Parameters

Use Signals for reactive parameter binding:

```typescript
export class UserDetailComponent {
  private readonly usersResource = inject(UsersResource);
  private readonly userId = signal(1);
  
  // Automatically refetches when userId changes
  readonly user = this.usersResource.getUserById(this.userId);
  
  updateUser(newId: number) {
    this.userId.set(newId); // Triggers automatic refetch
  }
}
```

## Default Values

Provide fallback values while data is loading:

```typescript
export class UsersComponent {
  private readonly usersResource = inject(UsersResource);
  
  readonly users = this.usersResource.getUsers(
    { defaultValue: [] }
  );
}
```

## Query Parameters

Pass both static and reactive query parameters:

```typescript
export class SearchComponent {
  private readonly usersResource = inject(UsersResource);
  private readonly searchTerm = signal('');
  private readonly pageSize = signal(10);
  
  readonly searchResults = this.usersResource.searchUsers(
    this.searchTerm,    // reactive search term
    this.pageSize,      // reactive page size
    'active'            // static status filter
  );
  
  updateSearch(term: string) {
    this.searchTerm.set(term);
  }
}
```

## Resource vs Service Comparison

| Feature | HTTP Resource | Traditional Service |
|---------|---------------|-------------------|
| **Loading State** | ✅ Built-in `isLoading()` | ❌ Manual state management |
| **Error Handling** | ✅ Built-in `error()` | ❌ Manual error handling |
| **Reactivity** | ✅ Signal-based | ❌ Observable-based |
| **Parameter Binding** | ✅ Signal or static | ❌ Manual subscription |
| **Request Deduplication** | ✅ Automatic | ❌ Manual implementation |
| **Maturity** | ⚠️ Experimental | ✅ Stable |

## Limitations

- **Experimental API**: Subject to change in future Angular versions
- **GET Requests Only**: Currently optimized for "GET" requests (see [Angular Docs ↗️](https://angular.dev/guide/http/http-resource))

## Resources

- [Angular httpResource Documentation ↗️](https://angular.dev/guide/http/resource)
- [Angular Signals Guide ↗️](https://angular.dev/guide/signals)
- [ng-openapi Configuration](../api/configuration.md)