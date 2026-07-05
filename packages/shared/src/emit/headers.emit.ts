export interface HeadersEmitOptions {
    /** Identifier of the per-request options parameter in the generated method ("options", "requestOptions", …). */
    optionsExpression: string;
    /** Default headers from GeneratorConfig, added when not already present on the request. */
    customHeaders?: Record<string, string>;
    /** Content-Type rules derived from the operation's body; omit to skip (http-resource is GET-only). */
    contentType?: {
        isMultipart: boolean;
        isUrlEncoded: boolean;
        hasBody: boolean;
    };
}

/**
 * Emits the `headers` initialization block: normalize the caller-supplied
 * headers into HttpHeaders, apply configured default headers, then apply
 * Content-Type rules.
 */
export function emitHeaders(options: HeadersEmitOptions): string {
    const { optionsExpression, customHeaders, contentType } = options;

    let headerCode = `
let headers: HttpHeaders;
if (${optionsExpression}?.headers instanceof HttpHeaders) {
  headers = ${optionsExpression}.headers;
} else {
  headers = new HttpHeaders(${optionsExpression}?.headers);
}`;

    if (customHeaders) {
        headerCode += `
// Add default headers if not already present
${emitDefaultHeaderGuards(customHeaders)}`;
    }

    if (contentType?.isMultipart) {
        headerCode += `
// Remove Content-Type for multipart (browser will set it with boundary)
headers = headers.delete('Content-Type');`;
    } else if (contentType?.isUrlEncoded) {
        headerCode += `
// Set Content-Type for URL-encoded form data
if (!headers.has('Content-Type')) {
  headers = headers.set('Content-Type', 'application/x-www-form-urlencoded');
}`;
    } else if (contentType?.hasBody) {
        headerCode += `
// Set Content-Type for JSON requests if not already set
if (!headers.has('Content-Type')) {
  headers = headers.set('Content-Type', 'application/json');
}`;
    }

    return headerCode;
}

/**
 * Merges configured default headers into caller headers that may be an
 * HttpHeaders instance or a plain record (http-resource's request options).
 * Cast-free: the plain record is never funneled through the HttpHeaders
 * constructor, whose accepted value types are narrower than
 * HttpResourceRequest's.
 */
export function emitDefaultHeadersMerge(optionsExpression: string, customHeaders: Record<string, string>): string {
    const defaultsLiteral = Object.entries(customHeaders)
        .map(([key, value]) => `'${key}': '${value}'`)
        .join(", ");

    return `
// Add default headers if not already present
let headers = ${optionsExpression}?.headers;
if (headers instanceof HttpHeaders) {
${emitDefaultHeaderGuards(customHeaders)}
} else {
  headers = { ${defaultsLiteral}, ...headers };
}`;
}

function emitDefaultHeaderGuards(customHeaders: Record<string, string>): string {
    return Object.entries(customHeaders)
        .map(
            ([key, value]) =>
                `if (!headers.has('${key}')) {
  headers = headers.set('${key}', '${value}');
}`,
        )
        .join("\n");
}
