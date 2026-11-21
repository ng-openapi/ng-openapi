---
description: "Generate signal-based Angular services using the httpResource API with the ng-openapi plugin."
title: HTTP Resource Plugin
---

# HTTP Resource Plugin

Generate Angular services using the `httpResource` API for automatic caching, state management, and reactive data loading.

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
import { GeneratorConfig } from "ng-openapi";
import { HttpResourcePlugin } from "@ng-openapi/http-resource";

export default {
    input: "./swagger.json",
    output: "./src/api",
    clientName: "MyApi",
    plugins: [HttpResourcePlugin],
    options: {
        dateType: "Date",
        enumStyle: "enum",
    },
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
import { ApplicationConfig } from "@angular/core";
import { provideMyApiClient } from "./api/providers";

export const appConfig: ApplicationConfig = {
    providers: [
        provideMyApiClient({
            basePath: "https://api.example.com",
        }),
    ],
};
```

## Basic Usage

Inject and use the generated resources in your components:

```typescript
import { Component, inject } from "@angular/core";
import { UsersResource } from "./api/resources";

@Component({
    selector: "app-users",
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
    `,
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

    readonly users = this.usersResource.getUsers({ defaultValue: [] });
}
```

## Query Parameters

Pass both static and reactive query parameters:

```typescript
export class SearchComponent {
    private readonly usersResource = inject(UsersResource);
    private readonly searchTerm = signal("");
    private readonly pageSize = signal(10);

    readonly searchResults = this.usersResource.searchUsers(
        this.searchTerm, // reactive search term
        this.pageSize, // reactive page size
        "active", // static status filter
    );

    updateSearch(term: string) {
        this.searchTerm.set(term);
    }
}
```

## QUERY Operations

OpenAPI 3.2's `query` operations — the HTTP `QUERY` method — are reads that carry their input in the request body, so they become resources too. A body declared as `application/json`, `multipart/form-data` or `application/x-www-form-urlencoded` is an argument like any other: pass a value, or a signal to have the resource re-send the query whenever it changes.

```typescript
export class ProductSearchComponent {
    private readonly productsResource = inject(ProductsResource);

    readonly criteria = signal<ProductSearch>({ text: "" });

    // QUERY /products/search, re-sent whenever `criteria` changes
    readonly results = this.productsResource.searchProducts(this.criteria);
}
```

A JSON body is one argument; a `multipart/form-data` or `application/x-www-form-urlencoded` body is one argument per field. The `Content-Type` header is set the way the generated services set it.

A body under any other content type (`text/plain`, `application/json; charset=utf-8`, `application/vnd.api+json`, …) is not bound: the resource method takes no argument for it and sends the query without a body — as soon as the resource is created, if it has no other required argument. Generation [warns about such a body](./generated-code.md#services-service-ts).

::: warning QUERY requires Angular 22.3+
Angular's `HttpClient` supports the `QUERY` method from 22.3 on. On older versions the request is still sent, but treated as a mutation: the XSRF token is attached to it, and server-side rendering does not reuse the response during hydration. See [Generated Output](./generated-code.md#services-service-ts).
:::

## Resource vs Service Comparison

| Feature                   | HTTP Resource             | Traditional Service        |
| ------------------------- | ------------------------- | -------------------------- |
| **Loading State**         | ✅ Built-in `isLoading()` | ❌ Manual state management |
| **Error Handling**        | ✅ Built-in `error()`     | ❌ Manual error handling   |
| **Reactivity**            | ✅ Signal-based           | ❌ Observable-based        |
| **Parameter Binding**     | ✅ Signal or static       | ❌ Manual subscription     |
| **Request Deduplication** | ✅ Automatic              | ❌ Manual implementation   |
| **Maturity**              | ✅ Stable                 | ✅ Stable                  |

## Limitations

- **Read Operations Only**: Resources are generated for `GET` and `QUERY` operations. An `httpResource` re-sends its request whenever a signal it read changes, so it is not meant for mutations — use the generated services for `POST`, `PUT`, `PATCH` and `DELETE` (see [Angular Docs ↗️](https://angular.dev/guide/http/http-resource))

## Resources

- [Angular httpResource Documentation ↗️](https://angular.dev/guide/http/resource)
- [Angular Signals Guide ↗️](https://angular.dev/guide/signals)
- [ng-openapi Configuration](../api/configuration.md)
