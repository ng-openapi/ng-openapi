// packages/ng-openapi/src/lib/generators/admin/helpers/template.reader.ts

import * as fs from 'fs';
import * as path from 'path';

export function getTemplate(templateName: string): string {
    const testPath = path.join(__dirname, "..", "templates", templateName); // Adjust path for tests
    if (fs.existsSync(testPath)) {
        return fs.readFileSync(testPath, "utf8");
    }
    const prodPath = path.join(__dirname, "..", "..", "templates", templateName); // Adjust path for dist
    if (fs.existsSync(prodPath)) {
        return fs.readFileSync(prodPath, "utf8");
    }
    throw new Error(`CRITICAL: Template file "${templateName}" not found at ${testPath} or ${prodPath}.`);
}

export function renderTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (placeholder, key) =>
        context[key] !== undefined ? String(context[key]) : placeholder
    );
}