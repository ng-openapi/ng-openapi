<div align="center">
  <h1 align="center"><img src="./public/ng-openapi-logo.svg" alt="Logo" style="height: 12vh; margin-bottom: 2vh;"></h1>
  <h1 align="center"><b>Angular OpenAPI Client Generator</b></h1>
  <p align="center">💪 Made with ❤️ by Angular Devs for Angular Devs</p>
</div>

<br/>

## Introduction

ng-openapi is a modern Angular-first OpenAPI client generator that creates type-safe services and interfaces from your OpenAPI specifications. Unlike generic TypeScript generators, ng-openapi is built specifically for Angular developers who want clean, maintainable code that leverages Angular's latest features.

## Why Choose ng-openapi?

While several OpenAPI generators exist, ng-openapi addresses the gaps that Angular developers face daily:

### 🚀 **Modern Angular Support**
Uses Angular's latest features like the `inject()` function and the new `HttpResource` API, keeping your generated code up-to-date with current Angular best practices.

### 🎯 **Smart Enum Handling**
Instead of generating unreadable integer enums or forcing string enums, ng-openapi gives you the ability to preserve your backend enum structure, giving you the exact same enums you use in your API.

### 🔧 **Customizable Function Names**
Instead of using the `operationId` as the function name, ng-openapi allows you to customize the function names for better readability and maintainability.
### 🌐 **Multi-Client Architecture**
Built-in support for multiple API clients with the ability to apply different HTTP interceptors to each client independently.

## Quick Example

```bash
# Install ng-openapi
npm install ng-openapi --save-dev

# Generate from OpenAPI spec
ng-openapi -i swagger.json -o ./src/api

# Use in your Angular app
import { provideNgOpenapi } from './api/providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideNgOpenapi({ basePath: 'https://api.example.com' })
  ]
};
```

## What's Included

- **TypeScript Interfaces** - Accurate type definitions from your OpenAPI schemas
- **Angular Services** - Injectable services with proper dependency injection
- **HTTP Interceptors** - Automatic date transformation and custom headers
- **Provider Functions** - Easy setup with `provideNgOpenapi()`
- **File Utilities** - Download helpers and file handling
- **CLI Tool** - Powerful command-line interface with config file support

<div class="tip custom-block" style="padding-top: 8px">

Just want to try it out? Skip to [Quick Start](./getting-started/quick-start.md).

</div>