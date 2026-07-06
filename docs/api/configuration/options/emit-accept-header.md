---
description: "emitAcceptHeader: send an Accept header derived from each operation's response content types."
title: Emit Accept Header
---

# `emitAcceptHeader`

**Type:** `boolean | undefined` | **Default:** `true`

Sends an `Accept` header derived from each operation's response content types, so servers that use content negotiation (for example versioned vendor media types like `application/vnd.users+json;version=1.0`) return the representation the generated method is prepared to parse.

The header value contains the content types declared on the operation's first success response that agree with the method's Angular `responseType` — advertising a type the method could not parse is deliberately avoided. Operations whose success response declares no content (for example `204 No Content`) send no `Accept` header.

The generated code only sets the header when it is not already present, so values from [`customHeaders`](custom-headers) or per-request options always win:

```typescript
// generated
if (!headers.has('Accept')) {
    headers = headers.set('Accept', 'application/vnd.users+json;version=1.0');
}
```

Set `emitAcceptHeader: false` to restore the previous behavior of sending no `Accept` header.

## Usage

```typescript
// openapi.config.ts
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  options: {
    emitAcceptHeader: false, // opt out of the spec-derived Accept header
  },
  ... // other configurations
};

export default config;
```
