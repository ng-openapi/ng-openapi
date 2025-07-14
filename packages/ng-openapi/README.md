# ng-openapi Usage Guide

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

- `options.dateType` - How to handle date types: `'string'` or `'Date'` (default: `'Date'`)
- `options.enumStyle` - Enum generation style: `'enum'` or `'union'` (default: `'enum'`)
- `options.generateEnumBasedOnDescription` - Parse enum values from description field (default: `true`)
- `options.generateServices` - Generate Angular services (default: `true`)
- `options.customHeaders` - Headers to add to all HTTP requests
- `options.responseTypeMapping` - Map content types to Angular HttpClient response types
- `options.customizeMethodName` - Function to customize generated method names
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
└── utils/
    ├── date-transformer.ts  # Date transformation interceptor
    └── file-download.ts     # File download helpers
```

## Angular Integration

### 1. Configure Base Path

```typescript
import { BASE_PATH } from './api/tokens';

// In your app.config.ts or module
export const appConfig: ApplicationConfig = {
  providers: [
    { provide: BASE_PATH, useValue: 'https://api.example.com' },
    // other providers...
  ]
};
```

### 2. Add Date Interceptor (if using Date type)

```typescript
import { DateInterceptor } from './api/utils/date-transformer';
import { HTTP_INTERCEPTORS } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: DateInterceptor, multi: true },
    // other providers...
  ]
};
```

### 3. Use Generated Services

```typescript
import { UserService } from './api/services';
import { User } from './api/models';

@Component({
  selector: 'app-users',
  template: `...`
})
export class UsersComponent {
  users$ = this.userService.getUsers();

  constructor(private userService: UserService) {}
}
```

## File Download Example

```typescript
import { downloadFileOperator } from './api/utils/file-download';

export class ReportComponent {
  constructor(private reportService: ReportService) {}

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
    "generate:api": "ng-openapi -c openapi.config.ts",
    "generate:api:watch": "nodemon --watch swagger.json --exec npm run generate:api"
  }
}
```