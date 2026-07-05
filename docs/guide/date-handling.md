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
        dateType: "Date", // Enables automatic transformation
    },
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
        this.usersService.getUserById(id).subscribe((user) => {
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
        dateType: "string", // No transformation
    },
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
        this.usersService.getUserById(id).subscribe((user) => {
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
provideDefaultClient({
    basePath: "https://api.example.com",
    enableDateTransform: false,
});
```

### Manual Setup

`DateInterceptor` is class-based, so it is registered through the `HTTP_INTERCEPTORS` multi-provider (`withInterceptors` only accepts functional interceptors):

```typescript
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { DateInterceptor } from "./client/utils/date-transformer";

export const appConfig: ApplicationConfig = {
    providers: [
        provideHttpClient(withInterceptorsFromDi()),
        { provide: HTTP_INTERCEPTORS, useClass: DateInterceptor, multi: true },
    ],
};
```

## Which Strings Are Detected as Dates?

The interceptor only converts strings matching a strict full ISO 8601 date-time pattern (`ISO_DATE_REGEX`), so bare years or numeric IDs are never accidentally turned into `Date` objects. The exact pattern and all recognized formats are documented in the [Date Transformer reference](../api/utilities/date-transformer.md#recognized-formats).

### Custom Date Regex

If your API returns a format the default pattern doesn't cover, pass your own
regex via the provider — no need to copy `date-transformer.ts`:

```typescript
provideDefaultClient({
    basePath: "https://api.example.com",
    // Use any pattern you like; it overrides ISO_DATE_REGEX
    dateTransformRegex: /your-custom-pattern/,
});
```

`transformDates` and `DateInterceptor` also accept the regex directly, so you can
reuse them in a manual interceptor setup:

```typescript
new DateInterceptor(/your-custom-regex/);
transformDates(responseBody, /your-custom-regex/);
```

## Resources

- [Date Transformer reference](../api/utilities/date-transformer.md) — recognized formats, generated source, manual setup
- [JavaScript Date ↗️](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)
- [Angular HTTP Interceptors ↗️](https://angular.dev/guide/http/interceptors)
