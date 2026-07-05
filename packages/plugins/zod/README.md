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

The Zod plugin generates [Zod](https://zod.dev) schemas from your OpenAPI specification, so you can validate API
requests and responses at runtime. For every operation it emits schemas for the request body, query parameters, and
each response status, along with the inferred TypeScript types.

> Requires Zod v4 or later — Zod v3 is not supported.

## Installation

```bash
npm install @ng-openapi/zod zod ng-openapi --save-dev
```

## Quick Start

### 1. Configure Plugin

```typescript
// openapi.config.ts
import { GeneratorConfig } from "ng-openapi";
import { ZodPlugin } from "@ng-openapi/zod";

export default {
    input: "./swagger.json",
    output: "./src/api",
    plugins: [ZodPlugin],
    options: {
        dateType: "Date",
        enumStyle: "enum",
        validation: {
            response: true, // adds the `parse` hook to generated service methods
        },
    },
} as GeneratorConfig;
```

### 2. Generate Schemas

```bash
ng-openapi -c openapi.config.ts
```

### 3. Setup Providers

```typescript
// app.config.ts
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

### 4. Use Generated Schemas

```typescript
import { Component, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { OrdersService } from "./api/services";
import { getOrderById200Response } from "./api/validators";

@Component({
    selector: "app-order",
    template: `...`,
})
export class OrderComponent {
    private readonly ordersService = inject(OrdersService);

    // Validate the response at runtime via the `parse` option
    readonly order = toSignal(
        this.ordersService.getOrderById(1, undefined, {
            parse: getOrderById200Response.parse,
        }),
    );
}
```

## Generated Structure

```
src/api/
├── models/               # TypeScript interfaces
├── services/             # HttpClient services
├── validators/           # Zod schemas
│   ├── index.ts          # Schema exports
│   └── *.validator.ts    # Schemas per controller/tag
├── providers.ts          # Provider functions
└── index.ts              # Main exports
```

Each `*.validator.ts` file contains the Zod schemas and inferred types for one controller:

```typescript
import { z } from "zod";

export const listOrdersQueryParams = z.object({
    page: z.number().int().optional(),
    status: z.enum(["pending", "in-progress", "shipped", "cancelled"]).optional(),
});
export type ListOrdersQueryParams = z.infer<typeof listOrdersQueryParams>;

export const listOrders200ResponseItem = z.object({
    id: z.string().uuid(),
    status: z.enum(["pending", "in-progress", "shipped", "cancelled"]),
    total: z.number(),
});
```

## Documentation

- 📖 [Full Documentation](https://ng-openapi.dev/api/configuration/plugins/zod)
- ✅ [Schema Validation Guide](https://ng-openapi.dev/guide/schema-validation)
- 🚀 [Live Examples](https://stackblitz.com/@Mr-Jami/collections/ng-openapi-examples)
