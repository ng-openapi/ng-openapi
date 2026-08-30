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
 * ancestors.
 */
const NG_OPENAPI_ERROR_BRAND = "__ngOpenApiError";

/**
 * Class to lineage. A side table rather than a `static brand` on each class.
 *
 * A static would have to be non-writable to be trustworthy, and a non-writable
 * inherited static breaks subclassing outright: `static override brand = "X"`
 * compiles to a plain assignment unless `useDefineForClassFields` is on (it is
 * off by default at this repo's `target: es2015`), and assigning to a
 * non-writable inherited property throws at module-evaluation time — a
 * consumer subclassing one of these could not import their own module.
 *
 * Keying the table by the class object sidesteps that: there is no property for
 * a subclass to collide with, the names stay minifier-stable literals, and a
 * subclass nobody registered falls back to the prototype chain, which is the
 * correct answer for it.
 */
/** Any class object; narrower than `Function`, which lint rejects as too loose. */
type ErrorClass = { readonly prototype: unknown };

const ERROR_LINEAGE = new WeakMap<object, readonly string[]>();

/** Lineage for an instance whose class was never registered. */
const FALLBACK_LINEAGE: readonly string[] = Object.freeze(["NgOpenApiError"]);

/** Registers `cls` under `lineage`; returns it so declarations stay one statement. */
function registerError<T extends ErrorClass>(cls: T, lineage: readonly string[]): T {
    ERROR_LINEAGE.set(cls, Object.freeze([...lineage]));
    return cls;
}

/** The nearest registered ancestor's lineage — how an instance learns its own. */
function inheritedLineage(cls: object | undefined): readonly string[] {
    for (let current = cls; typeof current === "function"; current = Object.getPrototypeOf(current) as object) {
        const lineage = ERROR_LINEAGE.get(current);
        if (lineage) {
            return lineage;
        }
    }
    // Frozen: it is handed to an instance as its brand, and a caller that
    // pushed to it would upgrade that instance's `instanceof`.
    return FALLBACK_LINEAGE;
}

/** Base class of every error ng-openapi raises deliberately. */
export class NgOpenApiError extends Error {
    /** The underlying error that caused this one, when there is one. */
    readonly cause?: unknown;

    protected constructor(message: string, cause?: unknown) {
        super(message);
        // Read from the registry rather than taken as a parameter: a lineage
        // argument is forgeable by any subclass, `protected` or not, because
        // `super(...)` can pass whatever it likes.
        const lineage = inheritedLineage(new.target);
        this.name = lineage[0];
        this.cause = cause;
        // Non-enumerable: an enumerable brand leaks into JSON.stringify(error)
        // and structured logs, where it is noise.
        Object.defineProperty(this, NG_OPENAPI_ERROR_BRAND, {
            value: lineage,
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
     *
     * Never throws and never runs foreign code: both reflective reads sit
     * inside the try, because a Proxy traps `getPrototypeOf` just as readily as
     * `getOwnPropertyDescriptor`.
     */
    static override [Symbol.hasInstance](value: unknown): boolean {
        if (typeof value !== "object" || value === null) {
            return false;
        }

        try {
            if (Object.prototype.isPrototypeOf.call(this.prototype, value)) {
                return true;
            }

            // Only a registered class can match by brand; an unregistered
            // subclass gets the prototype answer above and nothing more, so it
            // cannot claim its parent's instances.
            const expected = ERROR_LINEAGE.get(this)?.[0];
            if (expected === undefined) {
                return false;
            }

            // The descriptor, not the property: an inherited value must not
            // count, a getter must not run, and the brand set above is
            // deliberately non-enumerable — an enumerable one came from
            // somewhere else, such as JSON.parse.
            const descriptor = Object.getOwnPropertyDescriptor(value, NG_OPENAPI_ERROR_BRAND);
            if (!descriptor || descriptor.enumerable || !("value" in descriptor)) {
                return false;
            }
            return Array.isArray(descriptor.value) && descriptor.value.includes(expected);
        } catch {
            return false;
        }
    }
}
registerError(NgOpenApiError, ["NgOpenApiError"]);

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
registerError(SpecLoadError, ["SpecLoadError", "NgOpenApiError"]);

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
registerError(SpecParseError, ["SpecParseError", "NgOpenApiError"]);

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

/** Snapshot, so the error cannot be mutated through the caller's object. */
function captureOperation(operation: OperationRef): OperationRef {
    return Object.freeze({
        operationId: operation.operationId,
        method: operation.method,
        path: operation.path,
    });
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
    /** The rejected name, verbatim; absent when no name could be derived. */
    readonly identifier?: string;

    /** The operation whose name was being derived. */
    readonly operation: OperationRef;

    constructor(message: string, operation: OperationRef, identifier?: string) {
        super(message);
        this.operation = captureOperation(operation);
        this.identifier = identifier;
    }
}
registerError(InvalidIdentifierError, ["InvalidIdentifierError", "NgOpenApiError"]);

/**
 * Two operations produced the same generated name, which would emit colliding
 * declarations. Distinct from InvalidIdentifierError: each name is valid on its
 * own, they just cannot coexist.
 */
export class DuplicateGeneratedNameError extends NgOpenApiError {
    /** The colliding generated names. */
    readonly names: readonly string[];

    /** The operations that produced them, when known. */
    readonly operations: readonly OperationRef[];

    constructor(message: string, names: readonly string[], operations: readonly OperationRef[] = []) {
        super(message);
        this.names = Object.freeze([...names]);
        this.operations = Object.freeze(operations.map(captureOperation));
    }
}
registerError(DuplicateGeneratedNameError, ["DuplicateGeneratedNameError", "NgOpenApiError"]);

/**
 * A path template contains a `{placeholder}` with no matching parameter. Raised
 * rather than emitted: the unsubstituted placeholder used to ship as literal
 * text in every request URL, which compiles and so escapes every compile-time
 * check the suite has.
 */
export class UnresolvedPathTemplateError extends NgOpenApiError {
    /** The path as written in the spec. */
    readonly path: string;

    /** Placeholder names with no declared parameter. */
    readonly placeholders: readonly string[];

    constructor(message: string, path: string, placeholders: readonly string[]) {
        super(message);
        this.path = path;
        this.placeholders = Object.freeze([...placeholders]);
    }
}
registerError(UnresolvedPathTemplateError, ["UnresolvedPathTemplateError", "NgOpenApiError"]);

/**
 * The user-supplied config is structurally invalid. Collects every issue
 * instead of failing on the first, so a config file can be fixed in one pass.
 */
export class ConfigValidationError extends NgOpenApiError {
    readonly issues: readonly string[];

    constructor(issues: readonly string[]) {
        super(`Invalid ng-openapi configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
        this.issues = Object.freeze([...issues]);
    }
}
registerError(ConfigValidationError, ["ConfigValidationError", "NgOpenApiError"]);

/**
 * The config file itself could not be loaded or evaluated — distinct from
 * SpecParseError, which says the *specification* failed to parse.
 */
export class ConfigLoadError extends NgOpenApiError {
    /** Path of the config file that failed to load. */
    readonly source: string;

    constructor(message: string, source: string, cause?: unknown) {
        super(message, cause);
        this.source = source;
    }
}
registerError(ConfigLoadError, ["ConfigLoadError", "NgOpenApiError"]);
