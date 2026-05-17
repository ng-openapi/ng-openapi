<div style="display: flex; flex-direction: column; align-items: center; text-align: center;">
  <h1><img src="./public/ng-openapi-logo.svg" alt="Logo" style="height: 12vh; margin-bottom: 2vh;"></h1>
  <h1><b>Angular OpenAPI Client Generator</b></h1>
  <p>💪 Made with ❤️ by Angular Devs for Angular Devs</p>
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

<div class="tip custom-block" style="padding-top: 8px">

Just want to try it out? Skip to [Quick Start](./getting-started/quick-start.md).

</div>
