---
title: Multiple Clients
---

# Multiple Clients

Configure multiple API clients in a single Angular application with independent configurations and interceptors.

## Overview

ng-openapi supports generating multiple clients for different APIs, each with their own base paths, interceptors, and configurations. This is useful when your application needs to communicate with multiple backend services.

## Generating Multiple Clients

Create separate configuration files for each API:

```typescript
// users-api.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  clientName: 'Users',
  input: './users-swagger.json',
  output: './src/api/users',
  options: {
    dateType: 'Date',
    enumStyle: 'enum'
  }
};

export default config;
```

```typescript
// orders-api.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  clientName: 'Orders',
  input: './orders-swagger.json',
  output: './src/api/orders',
  options: {
    dateType: 'Date',
    enumStyle: 'enum'
  }
};

export default config;
```

Generate each client:

```bash
ng-openapi -c users-api.config.ts
ng-openapi -c orders-api.config.ts
```

## Provider Configuration

Each client generates its own provider function based on the `clientName`:

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideUsersClient } from './api/users/providers';
import { provideOrdersClient } from './api/orders/providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideUsersClient({
      basePath: 'https://users-api.example.com'
    }),
    provideOrdersClient({
      basePath: 'https://orders-api.example.com'
    })
  ]
};
```

## Independent Interceptors

Apply different interceptors to each client:

```typescript
// auth.interceptor.ts
import { HttpInterceptor, HttpRequest, HttpHandler } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler) {
    const authReq = req.clone({
      headers: req.headers.set('Authorization', 'Bearer token')
    });
    return next.handle(authReq);
  }
}
```

```typescript
// logging.interceptor.ts
import { HttpInterceptor, HttpRequest, HttpHandler } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable()
export class LoggingInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler) {
    console.log('Request:', req.url);
    return next.handle(req);
  }
}
```

Configure interceptors per client:

```typescript
export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideUsersClient({
      basePath: 'https://users-api.example.com',
      interceptors: [AuthInterceptor] // Only for users API
    }),
    provideOrdersClient({
      basePath: 'https://orders-api.example.com',
      interceptors: [AuthInterceptor, LoggingInterceptor] // Both interceptors
    })
  ]
};
```

## Using Multiple Clients

Import and use services from different clients:

```typescript
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { UsersService } from './api/users/services';
import { OrdersService } from './api/orders/services';

@Component({
  selector: 'app-dashboard',
  template: `
    <div>
      <h2>Users: {{ users()?.length ?? 0 }}</h2>
      <h2>Orders: {{ orders()?.length ?? 0 }}</h2>
    </div>
  `
})
export class DashboardComponent {
  private readonly usersService = inject(UsersService);
  private readonly ordersService = inject(OrdersService);

  readonly users = toSignal(this.usersService.getUsers());
  readonly orders = toSignal(this.ordersService.getOrders());
}
```

## Client Isolation

Each client operates independently:

- **Separate Base Paths** - Different API endpoints
- **Independent Interceptors** - Apply different authentication, logging, or transformation logic
- **Isolated Configuration** - Different date handling, headers, or response types
- **No Cross-Client Interference** - Changes to one client don't affect others

## Generated Structure

With multiple clients, your project structure looks like:

```
src/
├── api/
│   ├── users/
│   │   ├── models/
│   │   ├── services/
│   │   ├── tokens/
│   │   ├── utils/
│   │   ├── providers.ts
│   │   └── index.ts
│   └── orders/
│       ├── models/
│       ├── services/
│       ├── tokens/
│       ├── utils/
│       ├── providers.ts
│       └── index.ts
└── app/
    └── app.config.ts
```

## Package.json Scripts

Organize generation scripts for multiple clients:

```json
{
  "scripts": {
    "generate:users": "ng-openapi -c users-api.config.ts",
    "generate:orders": "ng-openapi -c orders-api.config.ts",
    "generate:all": "npm run generate:users && npm run generate:orders"
  }
}
```

## Best Practices

### Naming Convention

Use descriptive client names that reflect the API purpose:

```typescript
clientName: 'Users'     // generates provideUsersClient
clientName: 'Orders'    // generates provideOrdersClient
clientName: 'Payments'  // generates providePaymentsClient
```

### Directory Organization

Keep clients in separate directories:

```bash
ng-openapi -c users-api.config.ts    # outputs to ./src/api/users
ng-openapi -c orders-api.config.ts   # outputs to ./src/api/orders
```

### Environment Configuration

Use environment-specific configurations:

```typescript
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideUsersClient({
      basePath: environment.usersApiUrl
    }),
    provideOrdersClient({
      basePath: environment.ordersApiUrl
    })
  ]
};
```

## Resources

- [Provider Configuration](../api/providers.md)
- [CLI Usage](./cli-usage.md)
- [Angular Dependency Injection ↗️](https://angular.dev/guide/di)