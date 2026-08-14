/**
 * Typed, user-facing errors of the spec pipeline.
 *
 * Hosts (CLI, programmatic callers, tests) branch on the error class — never
 * on message text, which is presentation and not part of the API contract.
 */

/**
 * Marks an error as ng-openapi's across copies of this module.
 *
 * `@ng-openapi/shared` is a private, bundled-in package (never published), so
 * each plugin's published bundle inlines its own copy of these classes. A
 * plugin-thrown error is therefore not `instanceof` the class a host imported
 * from `ng-openapi`. The brand is a plain string property, so it survives
 * bundling and identifies the error regardless of which copy created it —
 * hence `Symbol.hasInstance` below, which makes `instanceof` honour it.
 */
const NG_OPENAPI_ERROR_BRAND = "__ngOpenApiError";

/** Base class of every error ng-openapi raises deliberately. */
export class NgOpenApiError extends Error {
    /** The underlying error that caused this one, when there is one. */
    readonly cause?: unknown;

    /** Set to the concrete class name; see NG_OPENAPI_ERROR_BRAND. */
    readonly [NG_OPENAPI_ERROR_BRAND]: string;

    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = new.target.name;
        this.cause = cause;
        this[NG_OPENAPI_ERROR_BRAND] = new.target.name;
    }

    /**
     * Recognizes branded errors from another bundled copy of this module, so
     * `error instanceof SpecLoadError` works for a plugin-thrown error too.
     * Falls back to the prototype chain for anything unbranded.
     */
    static override [Symbol.hasInstance](value: unknown): boolean {
        if (typeof value !== "object" || value === null) {
            return false;
        }
        const brand = (value as Record<string, unknown>)[NG_OPENAPI_ERROR_BRAND];
        if (typeof brand === "string") {
            // `this` is the class instanceof was called on: the base matches any
            // branded error, a subclass only its own name.
            return this === NgOpenApiError || brand === this.name;
        }
        return Object.prototype.isPrototypeOf.call(this.prototype, value);
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
