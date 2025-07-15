# Angular OpenAPI client generator

[![npm version](https://img.shields.io/npm/v/ng-openapi.svg)](https://www.npmjs.com/package/ng-openapi)
## 💪 Made with ❤️ by Angular Devs for Angular Devs


## Quick Start Guide
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
import { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  input: './swagger.json',
  output: './src/api',
  options: {
    dateType: 'Date',
    enumStyle: 'enum',
    generateEnumBasedOnDescription: true,
    generateServices: true,
    customHeaders: {
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json'
    },
    responseTypeMapping: {
      'application/pdf': 'blob',
      'application/zip': 'blob',
      'text/csv': 'text'
    },
    customizeMethodName: (operationId) => {
      const parts = operationId.split('_');
      return parts[parts.length - 1] || operationId;
    }
  }
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

- `input` - Path to your Swagger/OpenAPI specification file
- `output` - Output directory for generated files

### Optional Fields

- `dateType` - How to handle date types: `'string'` or `'Date'` (default: `'Date'`)
- `enumStyle` - Enum generation style: `'enum'` or `'union'` (default: `'enum'`)
- `generateEnumBasedOnDescription` - Parse enum values from description field (default: `true`)
- `generateServices` - Generate Angular services (default: `true`)
- `customHeaders` - Headers to add to all HTTP requests
- `responseTypeMapping` - Map content types to Angular HttpClient response types
- `customizeMethodName` - Function to customize generated method names
- `compilerOptions` - TypeScript compiler options for code generation

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
│   ├── date-transformer.ts  # Date transformation interceptor
│   └── file-download.ts     # File download helpers
├── providers.ts        # Provider functions for easy setup
└── index.ts           # Main exports
```

## Angular Integration

### 🚀 Easy Setup (Recommended)

The simplest way to integrate ng-openapi is using the provider function:

```typescript
// In your app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideNgOpenapi } from './api/providers';

export const appConfig: ApplicationConfig = {
  providers: [
    // One-line setup with automatic interceptor configuration
    provideNgOpenapi({
      basePath: 'https://api.example.com'
    }),
    // other providers...
  ]
};
```

That's it! This automatically configures:
- ✅ BASE_PATH token
- ✅ Date transformation interceptor (if using Date type)


### Advanced Provider Options

```typescript
// Disable date transformation
provideNgOpenapi({
  basePath: 'https://api.example.com',
  enableDateTransform: false
});

// Async configuration
provideNgOpenapiAsync({
  basePath: () => import('./config').then(c => c.apiConfig.baseUrl)
});
```

## Using Generated Services

```typescript
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { UserService } from './api/services';
import { User } from './api/models';

@Component({
  selector: 'app-users',
  template: `...`
})
export class UsersComponent {
  private readonly userService = inject(UserService);
  readonly users = toSignal(this.userService.getUsers());
}
```

## File Download Example

```typescript
import { Component, inject } from '@angular/core';
import { downloadFileOperator } from './api/utils/file-download';

export class ReportComponent {
  private readonly reportService = inject(ReportService);

  downloadReport() {
    this.reportService.getReport('pdf', { reportId: 123 })
      .pipe(
        downloadFileOperator('report.pdf')
      )
      .subscribe();
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