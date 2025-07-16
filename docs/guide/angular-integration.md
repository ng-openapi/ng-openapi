---
title: Angular Integration
---

# Angular Integration

Configure ng-openapi providers and services in your Angular application.

## Basic Setup

### Configure Providers

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideNgOpenapi } from './client/providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideNgOpenapi({
      basePath: 'https://api.example.com'
    })
  ]
};
```

### Inject Services

```typescript
import { Component, inject } from '@angular/core';
import { UsersService } from './client/services';

@Component({
  selector: 'app-users',
  template: `<!-- template -->`
})
export class UsersComponent {
  private readonly usersService = inject(UsersService);
}
```

## Environment Configuration

```typescript
import { provideNgOpenapi } from './client/providers';
import { environment } from './environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideNgOpenapi({
      basePath: environment.apiUrl
    })
  ]
};
```

## Disable Date Transformation

```typescript
provideNgOpenapi({
  basePath: 'https://api.example.com',
  enableDateTransform: false
})
```

## Manual Configuration

```typescript
import { BASE_PATH } from './client/tokens';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: BASE_PATH, useValue: 'https://api.example.com' }
  ]
};
```

## Resources

- [Angular Dependency Injection ↗️](https://angular.dev/guide/di)
- [Angular Providers ↗️](https://angular.dev/guide/di/dependency-injection-providers)