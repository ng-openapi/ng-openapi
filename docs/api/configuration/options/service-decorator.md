---
description: "serviceDecorator: emit Angular 22+'s @Service() instead of @Injectable({ providedIn: 'root' })."
title: Service Decorator
---

# `serviceDecorator`

**Type:** `'injectable' | 'service' | undefined` | **Default:** `'injectable'`

Selects the class decorator emitted on generated services (and, when the [HTTP Resource plugin](../plugins/http-resource) is enabled, on generated resource classes). With `'service'`, the generator emits Angular 22+'s [`@Service()`](https://angular.dev/guide/di/creating-and-using-services) decorator — an ergonomic shorthand for exactly `@Injectable({ providedIn: 'root' })` — and imports `Service` instead of `Injectable` from `@angular/core`.

::: warning Requires Angular 22+
`@Service()` does not exist below Angular 22, so code generated with `serviceDecorator: 'service'` will not compile on Angular ≤ 21. At the time of writing, `@Service` is also a **pre-release** API in Angular 22 and its shape may still change. The default (`'injectable'`) keeps today's output unchanged.
:::

When `'service'` is set and an `@angular/core` older than 22 is detected in the workspace the generator runs in, a warning is printed; generation still proceeds, since the workspace running the CLI is not always the workspace that compiles the output (monorepos, CI).

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    serviceDecorator: 'service'
  },
  ... // other configurations
};

export default config;
```

## Example

```typescript
// serviceDecorator: 'injectable' (default)
import { inject, Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class PetsService { ... }
```

```typescript
// serviceDecorator: 'service'
import { inject, Service } from "@angular/core";

@Service()
export class PetsService { ... }
```

## Notes

- `@Service()` maps only to `@Injectable({ providedIn: 'root' })` — the advanced `@Injectable` options (`useClass`, `useValue`, `useExisting`, `useFactory`) are not expressible with it. Generated services only ever use `providedIn: 'root'`, so this is not a limitation here
- The generated utility interceptors (`DateInterceptor`, the base interceptor) keep their bare `@Injectable()` decorator: they are provided manually through tokens, not as root singletons, so `@Service()` does not apply to them
- The option affects both `ng-openapi` services and `@ng-openapi/http-resource` resource classes consistently
