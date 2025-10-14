import * as fs from 'fs';
import * as path from 'path';

export function getTemplate(templateName: string): string {
    const testPath = path.join(__dirname, "..", "templates", templateName); // Path for tests
    if (fs.existsSync(testPath)) {
        return fs.readFileSync(testPath, "utf8");
    }
    const prodPath = path.join(__dirname, "..", "..", "templates", templateName); // Path for dist
    if (fs.existsSync(prodPath)) {
        return fs.readFileSync(prodPath, "utf8");
    }
    throw new Error(`CRITICAL: Template file "${templateName}" not found at ${testPath} or ${prodPath}.`);
}

/**
 * A robust templating engine that processes {{variable}} and @if(key){...} blocks,
 * including basic nesting, by making multiple passes.
 */
export function renderTemplate(template: string, context: Record<string, any>): string {
    let output = template;

    // Pass 1: Resolve all simple {{variable}} placeholders.
    output = output.replace(/\{\{\s*([\w\d.-]+)\s*\}\}/g, (match, key) => {
        const value = context[key.trim()];
        return value !== undefined && value !== null ? String(value) : '';
    });

    // Pass 2: Iteratively resolve @if blocks. This handles nesting correctly
    // by repeatedly finding and replacing the innermost blocks until none are left.
    const ifRegex = /@if\s*\(([\w\d.-]+)\)\s*\{([\s\S]*?)\}(?:\s*@else\s*\{([\s\S]*?)\})?/g;

    let lastOutput;
    // Keep looping as long as substitutions are being made.
    do {
        lastOutput = output;
        output = output.replace(ifRegex, (match, conditionKey, ifContent, elseContent) => {
            // This is the key: if the content still has an @if, it's not the innermost block.
            // Skip it on this pass; it will be processed in a subsequent iteration.
            if (ifRegex.test(ifContent) || (elseContent && ifRegex.test(elseContent))) {
                return match;
            }
            // This is an innermost block, so we can safely process it.
            return context[conditionKey.trim()] ? ifContent : (elseContent || '');
        });
    } while (output !== lastOutput);

    // Clean up excessive newlines that might result from removed blocks.
    output = output.replace(/(\r\n|\n|\r){2,}/g, '$1\n');

    return output;
}
