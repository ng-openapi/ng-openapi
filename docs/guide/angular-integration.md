---
description: "Wire generated ng-openapi clients into your Angular app with providers, environments, and tokens."
title: Angular Integration
---

# Angular Integration

Configure ng-openapi providers and services in your Angular application.

## Basic Setup

### Configure Providers

```typescript
import { ApplicationConfig } from "@angular/core";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideDefaultClient } from "./client/providers";
import { defaultClientInterceptor } from "./client/utils/base-interceptor";

export const appConfig: ApplicationConfig = {
    providers: [
        provideHttpClient(withInterceptors([defaultClientInterceptor])),
        provideDefaultClient({
            basePath: "https://api.example.com",
        }),
    ],
};
```

`defaultClientInterceptor` is the generated functional interceptor that runs this client's scoped interceptor chain; requests from other clients pass through untouched. DI-based setups can use `withInterceptorsFromDi()` instead — see [Providers](../api/providers.md#di-based-registration).

### Inject Services

```typescript
import { Component, inject } from "@angular/core";
import { UsersService } from "./client/services";

@Component({
    selector: "app-users",
    template: `<!-- template -->`,
})
export class UsersComponent {
    private readonly usersService = inject(UsersService);
}
```

## Environment Configuration

```typescript
import { provideDefaultClient } from "./client/providers";
import { environment } from "./environments/environment";

export const appConfig: ApplicationConfig = {
    providers: [
        provideDefaultClient({
            basePath: environment.apiUrl,
        }),
    ],
};
```

## Disable Date Transformation

```typescript
provideDefaultClient({
    basePath: "https://api.example.com",
    enableDateTransform: false,
});
```

## Manual Configuration

```typescript
import { BASE_PATH } from "./client/tokens";

export const appConfig: ApplicationConfig = {
    providers: [{ provide: BASE_PATH, useValue: "https://api.example.com" }],
};
```

## Resources

- [Angular Dependency Injection ↗️](https://angular.dev/guide/di)
- [Angular Providers ↗️](https://angular.dev/guide/di/dependency-injection-providers)
