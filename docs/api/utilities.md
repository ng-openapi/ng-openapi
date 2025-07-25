---
title: Utilities
---

# Utilities

A collection of Angular utilities to enhance your development experience with common patterns and functionality.

## Available Utilities

### [Date Transformer](utilities/date-transformer.md)
An Angular [HTTP Interceptor ↗️](https://angular.dev/guide/http/interceptors) that automatically converts date strings from API responses into JavaScript `Date` objects.

```typescript
// Automatically transforms ISO date strings to Date objects
{ "createdAt": "2024-01-15T10:30:00Z" }
// becomes
{ "createdAt": Date }
```

### [File Download Helper](utilities/file-download-helper.md)
A simple [RxJS operator ↗️](https://rxjs.dev/guide/operators) for handling file downloads in Angular applications.

```typescript
this.reportService.getReportById(123)
  .pipe(
    downloadFileOperator('report.pdf')
  )
  .subscribe();
```

## Usage

These utilities are designed to work seamlessly with Angular applications and follow Angular best practices. Each utility can be used independently or together as part of your application's architecture.