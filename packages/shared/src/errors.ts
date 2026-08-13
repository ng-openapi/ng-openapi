/**
 * Typed, user-facing errors of the spec pipeline.
 *
 * Hosts (CLI, programmatic callers, tests) branch on the error class — never
 * on message text, which is presentation and not part of the API contract.
 */

/** Base class of every error ng-openapi raises deliberately. */
export class NgOpenApiError extends Error {
    /** The underlying error that caused this one, when there is one. */
    readonly cause?: unknown;

    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = new.target.name;
        this.cause = cause;
    }
}

/**
 * The spec input could not be read at all: missing/unreadable file,
 * unsupported file extension, HTTP failure, timeout, or empty response.
 * `source` is the offending path or URL — the CLI uses it to decide
 * which hints to print.
 */
export class SpecLoadError extends NgOpenApiError {
    /** The file path or URL that failed to load. */
    readonly source: string;

    constructor(message: string, source: string, cause?: unknown) {
        super(message, cause);
        this.source = source;
    }
}

/**
 * The spec content was read but could not be used: malformed JSON/YAML,
 * undeterminable format, an unsupported spec version, or a spec rejected
 * by the user's `validateInput` hook.
 */
export class SpecParseError extends NgOpenApiError {
    /** The file path or URL the content came from, when known. */
    readonly source?: string;

    constructor(message: string, source?: string, cause?: unknown) {
        super(message, cause);
        this.source = source;
    }
}

/**
 * A name destined for generated code is not a usable TypeScript identifier.
 * The built-in conversions cannot produce one (see `string.utils.ts`), so this
 * only ever reports a name that came from a user hook — today
 * `customizeMethodName`. Raised instead of emitting the name, because a broken
 * identifier surfaces downstream as an opaque ts-morph manipulation error that
 * says nothing about which operation caused it.
 */
export class InvalidIdentifierError extends NgOpenApiError {
    /** The rejected name, verbatim. */
    readonly identifier: string;

    constructor(message: string, identifier: string) {
        super(message);
        this.identifier = identifier;
    }
}
