import type { NormalizedOperation } from "../model/operation.model";
import { CONTENT_TYPES } from "../utils/content-types.constants";
import { emitObjectKey, quoteLiteral } from "./literal.emit";

/** The facts of an operation's body that decide the request's `Content-Type`. */
export type BodyContentTypeFacts = Pick<NormalizedOperation, "isMultipart" | "isUrlEncoded" | "bodyContentType">;

export interface HeadersEmitOptions {
    /** Identifier of the per-request options parameter in the generated method ("options", "requestOptions", …). */
    optionsExpression: string;
    /** Default headers from GeneratorConfig, added when not already present on the request. */
    customHeaders?: Record<string, string>;
    /** Accept value derived from the operation's response content types; omit to skip. */
    accept?: string;
    /** Content-Type rules derived from the operation's body; omit to skip. */
    contentType?: BodyContentTypeFacts;
}

/**
 * Emits the `headers` initialization block: normalize the caller-supplied
 * headers into HttpHeaders, apply configured default headers, apply the
 * spec-derived Accept header, then apply Content-Type rules.
 */
export function emitHeaders(options: HeadersEmitOptions): string {
    const { optionsExpression, customHeaders, accept, contentType } = options;

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

    // `accept` is spec text (the response content types), so it is quoted
    // like every other emitted literal rather than interpolated raw.
    if (accept) {
        headerCode += `
// Advertise the response content type declared in the spec
if (!headers.has('Accept')) {
  headers = headers.set('Accept', ${quoteLiteral(accept)});
}`;
    }

    const defaultType = contentType && defaultContentType(contentType);
    if (contentType?.isMultipart) {
        headerCode += `
// Remove Content-Type for multipart (browser will set it with boundary)
headers = headers.delete('Content-Type');`;
    } else if (defaultType) {
        const comment = contentType?.isUrlEncoded
            ? "// Set Content-Type for URL-encoded form data"
            : defaultType === CONTENT_TYPES.JSON
              ? "// Set Content-Type for JSON requests if not already set"
              : "// Set the Content-Type the request body is declared with, if not already set";
        headerCode += `
${comment}
if (!headers.has('Content-Type')) {
  headers = headers.set('Content-Type', ${quoteLiteral(defaultType)});
}`;
    }

    return headerCode;
}

/**
 * The Content-Type a generated request declares when the caller set none, or
 * undefined when it declares none: no body is sent, or a multipart one, whose
 * header only the browser can write (the boundary belongs in it) and which
 * every client therefore removes instead.
 *
 * A body that is sent declares the content type it is written under in the
 * spec, parameters and all (`application/merge-patch+json`,
 * `text/plain; charset=utf-8`) — unless the normalizer left that to the
 * value itself (`bodyContentType`), where HttpClient sends a Blob's own type.
 * The one exception the other way is a urlencoded form without fields: it
 * sends no body and keeps its header, which is what the normalizer's warning
 * about such a form tells the user.
 *
 * The one place this is decided. The core service applies it through
 * `emitHeaders`, the http-resource plugin through its default-headers merge.
 */
export function defaultContentType(body: BodyContentTypeFacts): string | undefined {
    if (body.isMultipart) {
        return undefined;
    }
    if (body.isUrlEncoded) {
        return body.bodyContentType ?? CONTENT_TYPES.FORM_URLENCODED;
    }
    return body.bodyContentType;
}

export interface DefaultHeadersMergeOptions {
    /**
     * The request carries a `FormData` body: no Content-Type may survive the
     * merge, whoever set it, because only the browser knows the boundary that
     * belongs in it.
     */
    dropContentType?: boolean;
}

/**
 * Merges configured default headers into caller headers that may be an
 * HttpHeaders instance or a plain record (http-resource's request options).
 * Cast-free: the plain record is never funneled through the HttpHeaders
 * constructor, whose accepted value types are narrower than
 * HttpResourceRequest's.
 *
 * With `dropContentType` the merge also removes the header from both shapes.
 * A record is matched by name the way HttpHeaders matches one —
 * case-insensitively — so `content-type` goes as surely as `Content-Type`,
 * and a default the config declares is merged first and filtered with the rest.
 */
export function emitDefaultHeadersMerge(
    optionsExpression: string,
    customHeaders: Record<string, string>,
    options: DefaultHeadersMergeOptions = {},
): string {
    const defaults = Object.entries(customHeaders)
        // emitObjectKey, not quoteLiteral: this is a key position, and a
        // '__proto__' key hijacks the prototype exactly as a "__proto__" one does.
        .map(([key, value]) => `${emitObjectKey(key, "single")}: ${quoteLiteral(value)}`);
    const hasDefaults = defaults.length > 0;
    // `...headers` is always there, so the literal is valid with no default at all.
    const merged = `{ ${[...defaults, "...headers"].join(", ")} }`;

    const statements = [
        ...(hasDefaults ? ["// Add default headers if not already present"] : []),
        `let headers = ${optionsExpression}?.headers;`,
        "if (headers instanceof HttpHeaders) {",
        ...(hasDefaults ? [emitDefaultHeaderGuards(customHeaders)] : []),
        ...(options.dropContentType
            ? [
                  "  // Remove Content-Type for multipart (browser will set it with boundary)",
                  "  headers = headers.delete('Content-Type');",
              ]
            : []),
        "} else {",
        options.dropContentType
            ? `  headers = Object.fromEntries(Object.entries(${merged})` +
              ".filter(([name]) => name.toLowerCase() !== 'content-type'));"
            : `  headers = ${merged};`,
        "}",
    ];

    return `\n${statements.join("\n")}`;
}

function emitDefaultHeaderGuards(customHeaders: Record<string, string>): string {
    return Object.entries(customHeaders)
        .map(([key, value]) => {
            const name = quoteLiteral(key);
            return `if (!headers.has(${name})) {
  headers = headers.set(${name}, ${quoteLiteral(value)});
}`;
        })
        .join("\n");
}
