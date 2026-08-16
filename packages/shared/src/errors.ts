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
 * from `ng-openapi`. The brand is a plain data property, so it survives
 * bundling and identifies the error regardless of which copy created it —
 * hence `Symbol.hasInstance` below, which makes `instanceof` honour it.
 *
 * It holds the full lineage, not one name, so a subclass still matches its
 * ancestors. Both the brand and the classes' `brand` statics are written from
 * string literals rather than read off `constructor.name`, because a minifier
 * rewrites class names — which is exactly the case this mechanism exists for.
 */
const NG_OPENAPI_ERROR_BRAND = "__ngOpenApiError";

/** Base class of every error ng-openapi raises deliberately. */
export class NgOpenApiError extends Error {
    /** Minifier-stable identity of this class, compared against the brand. */
    static readonly brand: string = "NgOpenApiError";

    /** The underlying error that caused this one, when there is one. */
    readonly cause?: unknown;

    constructor(message: string, lineage: readonly string[], cause?: unknown) {
        super(message);
        this.name = lineage[0];
        this.cause = cause;
        // Non-enumerable: an enumerable brand leaks into JSON.stringify(error)
        // and structured logs, where it is noise.
        Object.defineProperty(this, NG_OPENAPI_ERROR_BRAND, {
            // Frozen: the brand decides `instanceof`, so it must not be
            // reshaped after construction.
            value: Object.freeze([...lineage]),
            enumerable: false,
            writable: false,
            configurable: false,
        });
    }

    /**
     * Recognizes branded errors from another bundled copy of this module, so
     * `error instanceof SpecLoadError` works for a plugin-thrown error too.
     * The prototype chain is checked first, so a caller's own subclass of these
     * classes still matches even though it carries no lineage entry.
     */
    static override [Symbol.hasInstance](value: unknown): boolean {
        if (typeof value !== "object" || value === null) {
            return false;
        }
        if (Object.prototype.isPrototypeOf.call(this.prototype, value)) {
            return true;
        }

        // A subclass that does not declare its own `brand` inherits this one,
        // which would make every parent instance look like an instance of it.
        // Without an own brand, the prototype check above is the only answer.
        if (!Object.prototype.hasOwnProperty.call(this, "brand")) {
            return false;
        }

        // Read the descriptor rather than the property: an inherited value must
        // not count (the same prototype-chain read fixed elsewhere in this
        // module), a getter must not run — `instanceof` must never throw or
        // execute foreign code — and the brand this class sets is deliberately
        // non-enumerable, so an enumerable one came from somewhere else, such
        // as JSON.parse.
        const descriptor = Object.getOwnPropertyDescriptor(value, NG_OPENAPI_ERROR_BRAND);
        if (!descriptor || descriptor.enumerable || !("value" in descriptor)) {
            return false;
        }
        return Array.isArray(descriptor.value) && descriptor.value.includes((this as typeof NgOpenApiError).brand);
    }
}

/**
 * The spec input could not be read at all: missing/unreadable file,
 * unsupported file extension, HTTP failure, timeout, or empty response.
 * `source` is the offending path or URL — the CLI uses it to decide
 * which hints to print.
 */
export class SpecLoadError extends NgOpenApiError {
    static override readonly brand = "SpecLoadError";

    /** The file path or URL that failed to load. */
    readonly source: string;

    constructor(message: string, source: string, cause?: unknown) {
        super(message, ["SpecLoadError", "NgOpenApiError"], cause);
        this.source = source;
    }
}

/**
 * The spec content was read but could not be used: malformed JSON/YAML,
 * undeterminable format, an unsupported spec version, or a spec rejected
 * by the user's `validateInput` hook.
 */
export class SpecParseError extends NgOpenApiError {
    static override readonly brand = "SpecParseError";

    /** The file path or URL the content came from, when known. */
    readonly source?: string;

    constructor(message: string, source?: string, cause?: unknown) {
        super(message, ["SpecParseError", "NgOpenApiError"], cause);
        this.source = source;
    }
}

/** Identifies the operation an emission-time error came from. */
export interface OperationRef {
    /** The operationId, when the spec declares one. */
    operationId?: string;
    method: string;
    path: string;
}

/** `(GET) /pets/{id}` — or `getPet ((GET) /pets/{id})` when the spec names it. */
export function describeOperation(operation: OperationRef): string {
    const location = `(${operation.method}) ${operation.path}`;
    return operation.operationId ? `${operation.operationId} (${location})` : location;
}

/**
 * A name destined for generated code is not a usable TypeScript identifier.
 * The built-in conversions cannot produce one (see `string.utils.ts`), so this
 * only ever reports a name that came from a user hook — today
 * `customizeMethodName` — or an operation missing the `operationId` that hook
 * needs. Raised instead of emitting the name, because a broken identifier
 * surfaces downstream as an opaque ts-morph manipulation error that says
 * nothing about which operation caused it.
 */
export class InvalidIdentifierError extends NgOpenApiError {
    static override readonly brand = "InvalidIdentifierError";

    /** The rejected name, verbatim; absent when no name could be derived. */
    readonly identifier?: string;

    /** The operation whose name was being derived. */
    readonly operation: OperationRef;

    constructor(message: string, operation: OperationRef, identifier?: string) {
        super(message, ["InvalidIdentifierError", "NgOpenApiError"]);
        this.operation = operation;
        this.identifier = identifier;
    }
}

/**
 * Two operations produced the same generated name, which would emit colliding
 * declarations. Distinct from InvalidIdentifierError: each name is valid on its
 * own, they just cannot coexist.
 */
export class DuplicateGeneratedNameError extends NgOpenApiError {
    static override readonly brand = "DuplicateGeneratedNameError";

    /** The colliding generated names. */
    readonly names: readonly string[];

    /** The operations that produced them, when known. */
    readonly operations: readonly OperationRef[];

    constructor(message: string, names: readonly string[], operations: readonly OperationRef[] = []) {
        super(message, ["DuplicateGeneratedNameError", "NgOpenApiError"]);
        this.names = names;
        this.operations = operations;
    }
}
