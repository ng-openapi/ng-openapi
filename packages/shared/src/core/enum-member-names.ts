// Concrete-module imports (not barrels) to keep the core <-> types/utils
// import graph cycle-free — see swagger-parser.ts for the same rule.
import type { EnumNamingOptions } from "../types/config.types";
import type { EnumValueObject, SwaggerDefinition } from "../types/swagger.types";
import { isPlainObject } from "../utils/functions/plain-object";
import { isValidIdentifier, pascalCaseForEnums } from "../utils/string.utils";

type Warn = (message: string) => void;

/**
 * Resolves the member names of a named enum schema, one per `enum` value.
 * Sources are tried in priority order and the first usable one wins:
 *
 * 1. each `enumNameExtensions` entry (`x-enum-varnames`, `x-enumNames`, …) —
 *    a string array positionally aligned with `enum`;
 * 2. the JSON-encoded description under `generateEnumBasedOnDescription` —
 *    `[{"Name","Value"}]` pairs matched to `enum` by value.
 *
 * `enum` stays the single source of truth for the values: a source only ever
 * contributes names. A source is all-or-nothing — one that is malformed,
 * incomplete or ambiguous is reported and skipped as a whole, because a
 * half-named enum would mix two naming schemes in one declaration.
 *
 * Only enums of strings and numbers are named. Any other value (`null` in a
 * nullable enum, most often) has no member a name could be attached to:
 * emitted in enum style it would be a member without an initializer, which
 * TypeScript numbers on its own, or the string `"null"`.
 */
export function resolveEnumMemberNames(
    schemaName: string,
    definition: SwaggerDefinition,
    config: EnumNamingOptions,
    onWarning?: (message: string) => void,
): string[] | undefined {
    const values: unknown = definition.enum;
    if (!Array.isArray(values) || values.length === 0) {
        return undefined;
    }
    const { enumNameExtensions = [], generateEnumBasedOnDescription } = config.options;
    const warn: Warn = (message) => onWarning?.(`Enum "${schemaName}": ${message}`);

    const names =
        namesFromExtensions(definition, enumNameExtensions, values.length, warn) ??
        (generateEnumBasedOnDescription ? namesFromDescription(definition.description, values, warn) : undefined);
    if (!names) {
        return undefined;
    }
    const unnameable = values.findIndex((value) => !isNameableValue(value));
    if (unnameable !== -1) {
        warn(
            `only enums of strings and numbers can be named, but it contains ${JSON.stringify(values[unnameable])} — ignoring the names`,
        );
        return undefined;
    }
    return names;
}

function isNameableValue(value: unknown): value is string | number {
    return typeof value === "string" || typeof value === "number";
}

function namesFromExtensions(
    definition: SwaggerDefinition,
    extensions: string[],
    valueCount: number,
    warn: Warn,
): string[] | undefined {
    for (const extension of extensions) {
        const names = namesFromExtension(definition, extension, valueCount, warn);
        if (names) {
            return names;
        }
    }
    return undefined;
}

function namesFromExtension(
    definition: SwaggerDefinition,
    extension: string,
    valueCount: number,
    warn: Warn,
): string[] | undefined {
    // Own properties only: an extension key must not read through to Object.prototype.
    if (!Object.prototype.hasOwnProperty.call(definition, extension)) {
        return undefined;
    }
    const candidates: unknown = (definition as Record<string, unknown>)[extension];
    if (
        !Array.isArray(candidates) ||
        candidates.length !== valueCount ||
        !candidates.every((candidate): candidate is string => typeof candidate === "string")
    ) {
        warn(`\`${extension}\` must be an array of ${valueCount} strings, one per enum value — ignoring it`);
        return undefined;
    }
    return toMemberNames(`\`${extension}\``, candidates, "ignoring it", warn);
}

function namesFromDescription(description: unknown, values: unknown[], warn: Warn): string[] | undefined {
    if (typeof description !== "string") {
        return undefined;
    }
    const unusable = (reason: string): undefined => {
        warn(
            `description looks like JSON (generateEnumBasedOnDescription) but could not be used: ${reason} — falling back to raw enum values`,
        );
        return undefined;
    };

    let parsed: unknown;
    try {
        parsed = JSON.parse(description);
    } catch {
        // Prose is expected here and stays silent, bracketed prose included
        // ("[Deprecated] use X"). Only text that opens like the payload — an
        // array of objects — is a failed attempt at it.
        return /^\s*\[\s*\{/.test(description) ? unusable("it does not parse") : undefined;
    }
    if (typeof parsed !== "object" || parsed === null) {
        // A description that is a bare JSON scalar ("42", "true") is prose too.
        return undefined;
    }
    if (!Array.isArray(parsed) || !parsed.every(isEnumValueObject)) {
        return unusable('expected an array of { "Name": string, "Value": string | number } objects');
    }

    // The first entry for a Value names it. Values are also indexed by their
    // text: descriptions commonly write `"Value": "1"` for the number 1.
    const nameByValue = new Map<string | number, string>();
    const nameByText = new Map<string, string>();
    for (const { Name, Value } of parsed) {
        if (!nameByValue.has(Value)) {
            nameByValue.set(Value, Name);
        }
        if (!nameByText.has(String(Value))) {
            nameByText.set(String(Value), Name);
        }
    }
    const candidates: string[] = [];
    for (const value of values) {
        const name = isNameableValue(value) ? (nameByValue.get(value) ?? nameByText.get(String(value))) : undefined;
        if (name === undefined) {
            return unusable(`no Name for enum value ${JSON.stringify(value)}`);
        }
        candidates.push(name);
    }
    return toMemberNames("the description", candidates, "falling back to raw enum values", warn);
}

function isEnumValueObject(candidate: unknown): candidate is EnumValueObject {
    return (
        isPlainObject(candidate) &&
        typeof candidate["Name"] === "string" &&
        (typeof candidate["Value"] === "string" || typeof candidate["Value"] === "number")
    );
}

/**
 * Turns author-supplied names into enum member identifiers. Names two members
 * would share are rejected rather than disambiguated: duplicate keys do not
 * compile in enum style and silently drop a member in union style.
 */
function toMemberNames(source: string, candidates: string[], consequence: string, warn: Warn): string[] | undefined {
    const names = candidates.map(toMemberName);
    const seen = new Set<string>();
    for (const name of names) {
        if (seen.has(name)) {
            warn(`names from ${source} are not unique ("${name}" occurs more than once) — ${consequence}`);
            return undefined;
        }
        seen.add(name);
    }
    return names;
}

/**
 * A name that already is an identifier is kept exactly as authored — casing is
 * the author's choice (`STATUS_ACTIVE` stays `STATUS_ACTIVE`). Anything else
 * goes through the same sanitizer as value-derived names. `__proto__` is a
 * legal identifier but, as a key of the union style's object literal, would
 * set the prototype instead of declaring a member.
 */
function toMemberName(name: string): string {
    return isValidIdentifier(name) && name !== "__proto__" ? name : pascalCaseForEnums(name);
}
