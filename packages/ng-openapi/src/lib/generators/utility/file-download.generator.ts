import {Project} from 'ts-morph';
import * as path from 'path';

export class FileDownloadGenerator {
    private project: Project;

    constructor(project: Project) {
        this.project = project;
    }

    generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, 'utils');
        const filePath = path.join(utilsDir, 'file-download.ts');

        const sourceFile = this.project.createSourceFile(filePath, '', {overwrite: true});

        sourceFile.addImportDeclaration({
            namedImports: ['Observable'],
            moduleSpecifier: 'rxjs',
        });

        sourceFile.addImportDeclaration({
            namedImports: ['tap'],
            moduleSpecifier: 'rxjs/operators',
        });

        // Add file download helper function
        sourceFile.addFunction({
            name: 'downloadFile',
            isExported: true,
            parameters: [
                {name: 'blob', type: 'Blob'},
                {name: 'filename', type: 'string'},
                {name: 'mimeType', type: 'string', hasQuestionToken: true}
            ],
            returnType: 'void',
            statements: `
    // Create a temporary URL for the blob
    const url = window.URL.createObjectURL(blob);
    
    // Create a temporary anchor element and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    // Append to body, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL
    window.URL.revokeObjectURL(url);`
        });

        // Add RxJS operator for automatic download - FIXED VERSION
        sourceFile.addFunction({
            name: 'downloadFileOperator',
            isExported: true,
            typeParameters: [{name: 'T', constraint: 'Blob'}],
            parameters: [
                {name: 'filename', type: 'string | ((blob: T) => string)'},
                {name: 'mimeType', type: 'string', hasQuestionToken: true}
            ],
            returnType: '(source: Observable<T>) => Observable<T>',
            statements: `
    return (source: Observable<T>) => {
        return source.pipe(
            tap((blob: T) => {
                const actualFilename = typeof filename === 'function' ? filename(blob) : filename;
                downloadFile(blob, actualFilename, mimeType);
            })
        );
    };`
        });

        // Add helper to extract filename from Content-Disposition header
        sourceFile.addFunction({
            name: 'extractFilenameFromContentDisposition',
            isExported: true,
            parameters: [
                {name: 'contentDisposition', type: 'string | null'},
                {name: 'fallbackFilename', type: 'string', initializer: '"download"'}
            ],
            returnType: 'string',
            statements: `
    if (!contentDisposition) {
        return fallbackFilename;
    }
    
    // Try to extract filename from Content-Disposition header
    // Supports both "filename=" and "filename*=" formats
    const filenameMatch = contentDisposition.match(/filename\\*?=['"]?([^'"\\n;]+)['"]?/i);
    
    if (filenameMatch && filenameMatch[1]) {
        // Decode if it's RFC 5987 encoded (filename*=UTF-8''...)
        const filename = filenameMatch[1];
        if (filename.includes("''")) {
            const parts = filename.split("''");
            if (parts.length === 2) {
                try {
                    return decodeURIComponent(parts[1]);
                } catch {
                    return parts[1];
                }
            }
        }
        return filename;
    }
    
    return fallbackFilename;`
        });

        sourceFile.saveSync();
    }
}