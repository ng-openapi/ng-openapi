---
description: "Angular-first OpenAPI client generator: type-safe services, models, and validation schemas from your OpenAPI specification."
layout: home

hero:
  name: ng-openapi
  text: Angular OpenAPI Client Generator
  tagline: Type-safe Angular services, models, and validation schemas — generated straight from your OpenAPI specification.
  image:
    src: /ng-openapi-logo.svg
    alt: ng-openapi logo
  actions:
    - theme: brand
      text: Quick Start
      link: /getting-started/quick-start
    - theme: alt
      text: What is ng-openapi?
      link: '#introduction'
    - theme: alt
      text: View on GitHub
      link: https://github.com/ng-openapi/ng-openapi

features:
  - icon: 🚀
    title: Modern Angular
    details: Generated code uses inject(), provider functions, and optionally the httpResource API — no legacy module boilerplate.
    link: /guide/angular-integration
    linkText: Angular integration
  - icon: 🌐
    title: Multi-Client Architecture
    details: Generate several API clients into one app, each with its own base path and its own HTTP interceptors.
    link: /guide/multiple-clients
    linkText: Multiple clients
  - icon: 🛡️
    title: Runtime Validation
    details: Validate responses at runtime through the parse hook — with generated Zod schemas or any validation library.
    link: /guide/schema-validation
    linkText: Schema validation
  - icon: 🎯
    title: Smart Enum Handling
    details: Preserve your backend enum names instead of unreadable generated ones — as TypeScript enums or literal unions.
    link: /api/configuration/options/enum-style
    linkText: Enum style
  - icon: 📅
    title: Automatic Date Handling
    details: date-time strings become real Date objects via a generated interceptor, with a customizable detection pattern.
    link: /guide/date-handling
    linkText: Date handling
  - icon: 🔌
    title: Pluggable
    details: httpResource and Zod ship as official plugins; write your own against a small documented contract.
    link: /guide/plugin-authoring
    linkText: Plugin authoring
---

## Introduction

ng-openapi is a modern Angular-first OpenAPI client generator that creates type-safe services and interfaces from your OpenAPI specifications. Unlike generic TypeScript generators, ng-openapi is built specifically for Angular developers who want clean, maintainable code that leverages Angular's latest features.

## Quick Example

```bash
# Install ng-openapi
npm install ng-openapi --save-dev

# Generate from OpenAPI spec
ng-openapi -i swagger.json -o ./src/api
```

```typescript
// Use in your Angular app
import { provideDefaultClient } from './api/providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideDefaultClient({ basePath: 'https://api.example.com' })
  ]
};
```

## What's Included

- **TypeScript Interfaces** - Accurate type definitions from your OpenAPI schemas
- **Angular Services** - Injectable services with proper dependency injection
- **HTTP Interceptors** - Automatic date transformation and custom headers
- **Provider Functions** - Easy setup with `provideDefaultClient()`
- **File Utilities** - Download helpers and file handling
- **CLI Tool** - Powerful command-line interface with config file support

See [Generated Output](./guide/generated-code.md) for a tour of every generated file.

## Support the Project

ng-openapi’s mission is to remain the #1 Angular client generation library.
If you’d like to support this journey, feel free to sponsor me with a coffee — after all, we all know a developer’s fuel is coffee 😄

<div style="display: flex; gap: 12px; margin: 20px 0; flex-wrap: wrap;">
  <a href="https://github.com/sponsors/ng-openapi" target="_blank" style="display: inline-flex; align-items: center; padding: 8px 16px; background: #24292f; color: white; border-radius: 6px; text-decoration: none; font-weight: 500;">
    <svg style="margin-right: 8px;" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.565 20.565 0 008 13.393a20.561 20.561 0 003.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.75.75 0 01-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5zM8 14.25l-.345.666-.002-.001-.006-.003-.018-.01a7.643 7.643 0 01-.31-.17 22.075 22.075 0 01-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.08 22.08 0 01-3.744 2.584l-.018.01-.006.003h-.002L8 14.25zm0 0l.345.666a.752.752 0 01-.69 0L8 14.25z"></path>
    </svg>
    Sponsor on GitHub
  </a>
</div>
