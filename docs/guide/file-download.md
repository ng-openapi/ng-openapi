---
title: File Downloads
---

# File Downloads

Use the built-in file download utilities with generated services.

## Basic Usage

### downloadFileOperator

```typescript
import { Component, inject } from '@angular/core';
import { downloadFileOperator } from './client/utils/file-download';
import { ReportsService } from './client/services';

export class ReportsComponent {
  private readonly reportsService = inject(ReportsService);

  downloadReport(reportId: number) {
    this.reportsService.getReportPdf(reportId)
      .pipe(
        downloadFileOperator('report.pdf')
      )
      .subscribe();
  }
}
```

### Dynamic Filenames

```typescript
downloadReport(reportId: number) {
  this.reportsService.getReportPdf(reportId)
    .pipe(
      downloadFileOperator(`report-${reportId}.pdf`)
    )
    .subscribe();
}
```

### Function-Based Filenames

```typescript
downloadReport(reportId: number) {
  this.reportsService.getReportPdf(reportId)
    .pipe(
      downloadFileOperator((blob: Blob) => {
        const date = new Date().toISOString().split('T')[0];
        return `report-${reportId}-${date}.pdf`;
      })
    )
    .subscribe();
}
```

## Extract Filename from Headers

### extractFilenameFromContentDisposition

```typescript
import { HttpClient, HttpResponse } from '@angular/common/http';
import { extractFilenameFromContentDisposition, downloadFile } from './client/utils/file-download';

export class FilesService {
  private readonly http = inject(HttpClient);

  downloadWithHeaders(url: string) {
    this.http.get(url, { 
      responseType: 'blob',
      observe: 'response'
    }).subscribe((response: HttpResponse<Blob>) => {
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = extractFilenameFromContentDisposition(
        contentDisposition,
        'download.pdf'
      );
      
      if (response.body) {
        downloadFile(response.body, filename);
      }
    });
  }
}
```

## Direct Download Function

### downloadFile

```typescript
import { downloadFile } from './client/utils/file-download';

// Direct usage without operator
this.reportsService.getReportPdf(reportId).subscribe(blob => {
  downloadFile(blob, 'report.pdf');
});
```

## Response Type Mapping

Configure blob responses in your OpenAPI config:

```typescript
// openapi.config.ts
const config: GeneratorConfig = {
  options: {
    responseTypeMapping: {
      'application/pdf': 'blob',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'blob'
    }
  }
};
```

## Resources

- [RxJS Operators ↗️](https://rxjs.dev/guide/operators)
- [Angular HTTP Client ↗️](https://angular.dev/guide/http)