<div align="center">
  <h1 align="center"><img src="./public/ng-openapi-logo.svg" alt="Logo" style="height: 12vh; margin-bottom: 2vh;"></h1>
  <h1 align="center"><b>Angular OpenAPI Client Generator</b></h1>
  <p align="center">💪 Made with ❤️ by Angular Devs for Angular Devs</p>
</div>

<br/>

## Introduction
ng-openapi, just like many other tools, is a code generator that creates Angular services and TypeScript interfaces from OpenAPI specifications.

The reason ng-openapi exists is to patch the gaps in existing tools, providing a more Angular-centric approach & a few additional features that make it easier to work with the generated code.


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