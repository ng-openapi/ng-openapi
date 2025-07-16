---
title: Custom Headers
---

# `customHeaders`

**Type:** `Record<string, string> | undefined` | **Default:** `undefined`

Default headers to be included in all HTTP requests made by the generated services.

:::tip
We recommend using the `HttpInterceptor` for setting headers — it's cleaner, more maintainable and recommended by the Angular Dev Community.

[Learn more in Angular Docs ↗️](https://angular.dev/api/common/http/HttpInterceptor)
:::

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    customHeaders: {
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json'
    },
  },
  ... // other configurations
};

export default config;
```