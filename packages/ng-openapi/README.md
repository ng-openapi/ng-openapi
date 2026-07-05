<div align="center">
  <h1 align="center"><img src="https://raw.githubusercontent.com/ng-openapi/ng-openapi/HEAD/docs/public/ng-openapi-logo.svg" alt="Logo" style="height: 12vh; margin-bottom: 2vh;" width="160"></h1>
  <h1 align="center"><b>Angular OpenAPI Client Generator</b></h1>
  <p align="center">💪 Made with ❤️ by Angular Devs for Angular Devs</p>
</div>

<p align="center">
  <a href="https://stackblitz.com/@Mr-Jami/collections/ng-openapi-examples">⚡Examples</a>
  <span>&nbsp;•&nbsp;</span>
  <a href="https://ng-openapi.dev/">📝Documentation</a>
  <span>&nbsp;•&nbsp;</span>
  <a href="https://github.com/ng-openapi/ng-openapi/issues">🐛Issues</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ng-openapi" rel="nofollow"><img src="https://img.shields.io/npm/v/ng-openapi.svg" alt="npm version"></a>
  <a href="https://opensource.org/license/mit" rel="nofollow"><img src="https://img.shields.io/github/license/ng-openapi/ng-openapi" alt="MIT License"></a>
  <a href="https://github.com/ng-openapi/ng-openapi/actions?query=branch%3Amain"><img src="https://img.shields.io/github/last-commit/ng-openapi/ng-openapi" alt="Last commit" /></a>
  <a href="https://github.com/ng-openapi/ng-openapi/actions?query=branch%3Amain"><img src="https://github.com/ng-openapi/ng-openapi/actions/workflows/release.yml/badge.svg?event=push&branch=main" alt="CI status" /></a>
  <a href="https://github.com/ng-openapi/ng-openapi/issues" rel="nofollow"><img src="https://img.shields.io/github/issues/ng-openapi/ng-openapi" alt="Number of open issues"></a>
  <a href="https://ng-openapi.dev/" rel="nofollow"><img src="https://img.shields.io/netlify/cb7a0f09-de25-40bb-960c-d8bc95b34c5e" alt="Netlify"></a>
</p>
<br/>

## Installation

```bash
npm install ng-openapi --save-dev
# or
yarn add ng-openapi --dev
```

## CLI Usage

### Using a Configuration File (Recommended)

Create a configuration file (e.g., `openapi.config.ts`):

```typescript
import { GeneratorConfig } from "ng-openapi";

const config: GeneratorConfig = {
    input: "./swagger.json",
    output: "./src/api",
    options: {
        dateType: "Date",
        enumStyle: "enum",
        generateEnumBasedOnDescription: true,
        generateServices: true,
        customHeaders: {
            "X-Requested-With": "XMLHttpRequest",
            Accept: "application/json",
        },
        responseTypeMapping: {
            "application/pdf": "blob",
            "application/zip": "blob",
            "text/csv": "text",
        },
        customizeMethodName: (operationId) => {
            const parts = operationId.split("_");
            return parts[parts.length - 1] || operationId;
        },
    },
};

export default config;
```

Then run:

```bash
# Direct command
ng-openapi -c openapi.config.ts

# Or with the generate subcommand
ng-openapi generate -c openapi.config.ts
```

### Using Command Line Options

```bash
# Generate both types and services
ng-openapi -i ./swagger.json -o ./src/api

# Generate only types
ng-openapi -i ./swagger.json -o ./src/api --types-only

# Specify date type
ng-openapi -i ./swagger.json -o ./src/api --date-type string
```

### Command Line Options

- `-c, --config <path>` - Path to configuration file
- `-i, --input <path>` - Path to Swagger/OpenAPI specification file
- `-o, --output <path>` - Output directory (default: `./src/generated`)
- `--types-only` - Generate only TypeScript interfaces
- `--date-type <type>` - Date type to use: `string` or `Date` (default: `Date`)

## Configuration Options

### Required Fields

- `input` - Path or URL to your Swagger/OpenAPI specification (`.json`, `.yaml`, `.yml`)
- `output` - Output directory for generated files
- `options.dateType` - How to handle date types: `'string'` or `'Date'`
- `options.enumStyle` - Enum generation style: `'enum'` or `'union'`

### Optional Fields

- `clientName` - Unique identifier for this client; names the generated provider function and tokens (default: `'default'`)
- `validateInput` - Custom acceptance check `(spec) => boolean`; returning `false` aborts generation
- `plugins` - Plugin generator classes (e.g. `HttpResourcePlugin`, `ZodPlugin`), run after core generation
- `compilerOptions` - TypeScript compiler options for code generation
- `options.generateServices` - Generate Angular services (default: `true`)
- `options.generateEnumBasedOnDescription` - Parse enum values from description field (default: `false`)
- `options.validation` - `{ response?: boolean }`; adds a `parse` hook to generated methods for response validation
- `options.customHeaders` - Headers to add to all HTTP requests
- `options.responseTypeMapping` - Map content types to Angular HttpClient response types
- `options.customizeMethodName` - Function to customize generated method names
- `options.useSingleRequestParameter` - Generate one request object parameter per method instead of positional parameters (default: `false`)

## Generated Files Structure

```
output/
├── models/
│   └── index.ts        # TypeScript interfaces/types
├── services/
│   ├── index.ts        # Service exports
│   └── *.service.ts    # Angular services
├── tokens/
│   └── index.ts        # Injection tokens
├── utils/
│   ├── base-interceptor.ts    # Client-scoped interceptor routing
│   ├── date-transformer.ts    # Date interceptor (dateType: "Date" only)
│   ├── file-download.ts       # File download helpers
│   └── http-params-builder.ts # Query-param serialization
├── providers.ts        # Provider functions for easy setup
└── index.ts           # Main exports
```

See [Generated Output](https://ng-openapi.dev/guide/generated-code) for what every file does.

## Angular Integration

### 🚀 Easy Setup (Recommended)

The simplest way to integrate ng-openapi is using the provider function:

```typescript
// In your app.config.ts
import { ApplicationConfig } from "@angular/core";
import { provideDefaultClient } from "./api/providers";

export const appConfig: ApplicationConfig = {
    providers: [
        // One-line setup with automatic interceptor configuration
        provideDefaultClient({
            basePath: "https://api.example.com",
        }),
        // other providers...
    ],
};
```

> The provider function is named after your `clientName` (e.g. `clientName: "PetStore"` → `providePetStoreClient`); without a `clientName` it is `provideDefaultClient`.

That's it! This automatically configures:

- ✅ BASE_PATH token
- ✅ Date transformation interceptor (if using Date type)

### Advanced Provider Options

```typescript
// Disable date transformation
provideDefaultClient({
    basePath: "https://api.example.com",
    enableDateTransform: false,
});

// Client-specific interceptors (classes, not instances)
provideDefaultClient({
    basePath: "https://api.example.com",
    interceptors: [AuthInterceptor, LoggingInterceptor],
});
```

## Using Generated Services

```typescript
import { Component, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { UserService } from "./api/services";
import { User } from "./api/models";

@Component({
    selector: "app-users",
    template: `...`,
})
export class UsersComponent {
    private readonly userService = inject(UserService);
    readonly users = toSignal(this.userService.getUsers());
}
```

## File Download Example

```typescript
import { Component, inject } from "@angular/core";
import { downloadFileOperator } from "./api/utils/file-download";

export class ReportComponent {
    private readonly reportService = inject(ReportService);

    downloadReport() {
        this.reportService.getReport("pdf", { reportId: 123 }).pipe(downloadFileOperator("report.pdf")).subscribe();
    }
}
```

## Package.json Scripts

Add these scripts to your `package.json`:

```json
{
    "scripts": {
        "generate:api": "ng-openapi -c openapi.config.ts"
    }
}
```

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](https://github.com/ng-openapi/ng-openapi/blob/main/CONTRIBUTING.md)
for setup and test workflows, and [ARCHITECTURE.md](https://github.com/ng-openapi/ng-openapi/blob/main/ARCHITECTURE.md)
for how the generation pipeline is structured and where new code should go.
