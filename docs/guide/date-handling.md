---
title: Date Handling
---

# Date Handling

Work with automatic date transformation features in ng-openapi.

## Automatic Date Transformation

### Configuration

```typescript
// openapi.config.ts
const config: GeneratorConfig = {
  options: {
    dateType: 'Date' // Enables automatic transformation
  }
};
```

### Generated Models

```typescript
// Generated interface with Date type
interface User {
  id: number;
  name: string;
  createdAt: Date; // Automatically transformed from ISO string
  updatedAt: Date;
}
```

### Usage

```typescript
export class UsersComponent {
  private readonly usersService = inject(UsersService);

  loadUser(id: number) {
    this.usersService.getUserById(id).subscribe(user => {
      // createdAt is already a Date object
      console.log(user.createdAt.getFullYear());
      console.log(user.createdAt.toLocaleDateString());
    });
  }
}
```

## String Dates

### Configuration

```typescript
// openapi.config.ts
const config: GeneratorConfig = {
  options: {
    dateType: 'string' // No transformation
  }
};
```

### Generated Models

```typescript
// Generated interface with string type
interface User {
  id: number;
  name: string;
  createdAt: string; // ISO string format
  updatedAt: string;
}
```

### Usage

```typescript
export class UsersComponent {
  loadUser(id: number) {
    this.usersService.getUserById(id).subscribe(user => {
      // Convert manually when needed
      const createdDate = new Date(user.createdAt);
      console.log(createdDate.getFullYear());
    });
  }
}
```

## Date Transformer Interceptor

### Disable Transformation

```typescript
// Disable in provider
provideNgOpenapi({
  basePath: 'https://api.example.com',
  enableDateTransform: false
})
```

### Manual Setup

```typescript
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { DateInterceptor } from './client/utils/date-transformer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([DateInterceptor]))
  ]
};
```

## ISO Date Regex

The date transformer uses this regex to identify date strings:

```typescript
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
```

Matches formats like:
- `2024-01-15T10:30:00Z`
- `2024-01-15T10:30:00.123Z`
- `2024-01-15T10:30:00`

## Resources

- [JavaScript Date ↗️](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)
- [Angular HTTP Interceptors ↗️](https://angular.dev/guide/http/interceptors)