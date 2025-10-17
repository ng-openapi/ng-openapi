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

    // Pass 2: Iteratively resolve @if blocks to handle nesting.
    const findMatchingBrace = (str: string, start: number): number => {
        let depth = 1;
        for (let i = start + 1; i < str.length; i++) {
            if (str[i] === '{') depth++;
            else if (str[i] === '}') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1; // Not found
    };

    let lastOutput;
    do {
        lastOutput = output;
        // Start from the end to find the innermost block first, which simplifies handling of nested @if statements.
        const startIndex = output.lastIndexOf('@if');
        if (startIndex === -1) break;

        const openParenIndex = output.indexOf('(', startIndex);
        const closeParenIndex = output.indexOf(')', openParenIndex);
        const openBraceIndex = output.indexOf('{', closeParenIndex);

        if (openParenIndex === -1 || closeParenIndex === -1 || openBraceIndex === -1) {
            break; // Malformed, break to avoid infinite loop
        }

        const closeBraceIndex = findMatchingBrace(output, openBraceIndex);
        if (closeBraceIndex === -1) {
            break; // Unmatched brace, break to avoid infinite loop
        }

        const conditionKey = output.substring(openParenIndex + 1, closeParenIndex).trim();
        const ifContent = output.substring(openBraceIndex + 1, closeBraceIndex);

        const afterIfBlock = output.substring(closeBraceIndex + 1);
        const elseMatch = afterIfBlock.match(/^\s*@else\s*\{/);

        let elseContent: string | null = null;
        let blockEndIndex = closeBraceIndex + 1;

        if (elseMatch) {
            const elseOpenBraceIndex = closeBraceIndex + 1 + elseMatch[0].length - 1;
            const elseCloseBraceIndex = findMatchingBrace(output, elseOpenBraceIndex);
            if (elseCloseBraceIndex !== -1) {
                elseContent = output.substring(elseOpenBraceIndex + 1, elseCloseBraceIndex);
                blockEndIndex = elseCloseBraceIndex + 1;
            }
        }

        const condition = !!context[conditionKey];
        const replacement = condition ? ifContent : (elseContent ?? '');

        // Reconstruct the string to avoid issues with special characters in `replace`
        output = output.substring(0, startIndex) + replacement + output.substring(blockEndIndex);

    } while (output !== lastOutput);

    // Clean up excessive newlines that might result from removed blocks.
    output = output.replace(/(\r\n|\n|\r){3,}/g, '$1\n\n');

    return output;
}
