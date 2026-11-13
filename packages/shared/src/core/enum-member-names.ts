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
 *    `[{"Name","Value"}]` pairs matched to `enum` by value. A description
 *    with no entry for any of the values is about something else and is
 *    passed over without a warning.
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

    // Entries are grouped by the text of their Value: descriptions commonly
    // write `"Value": "1"` for the number 1.
    const entriesByText = new Map<string, EnumValueObject[]>();
    for (const entry of parsed) {
        const text = String(entry.Value);
        const group = entriesByText.get(text);
        if (group) {
            group.push(entry);
        } else {
            entriesByText.set(text, [entry]);
        }
    }

    // An entry names one member. .NET lets an enum give one value several
    // names (`Light = 1, Pale = 1`), which arrives as `enum: [1, 1]` next to
    // both names — so the i-th occurrence of a value takes its i-th entry.
    const candidates: string[] = [];
    let gap: string | undefined;
    for (const value of values) {
        const group = isNameableValue(value) ? entriesByText.get(String(value)) : undefined;
        const entry = takeEntry(group, value);
        if (entry) {
            candidates.push(entry.Name);
        } else {
            gap ??= group
                ? `enum value ${JSON.stringify(value)} is listed more often than the description names it`
                : `no Name for enum value ${JSON.stringify(value)}`;
        }
    }
    if (candidates.length === 0) {
        // No entry is about any of these values: the description describes
        // something else — typically the numeric backing values of an enum
        // that is sent as strings. Nothing was attempted, nothing to report.
        return undefined;
    }
    if (gap) {
        return unusable(gap);
    }
    const names = toMemberNames("the description", candidates, "falling back to raw enum values", warn);
    if (!names) {
        return undefined;
    }

    // What is left in a group the enum drew from is a name without a member:
    // the description names that value more often than the enum lists it.
    const dropped = [...new Set(values.map(String))].flatMap((text) => entriesByText.get(text) ?? []);
    if (dropped.length > 0) {
        const list = dropped.map(({ Name, Value }) => `"${Name}" (value ${JSON.stringify(Value)})`).join(", ");
        warn(`the description names a value more often than the enum lists it — dropping ${list}`);
    }
    return names;
}

/** Removes and returns the next entry for `value`, one of the value's own type first. */
function takeEntry(group: EnumValueObject[] | undefined, value: unknown): EnumValueObject | undefined {
    if (!group?.length) {
        return undefined;
    }
    const sameType = group.findIndex((entry) => entry.Value === value);
    return group.splice(sameType === -1 ? 0 : sameType, 1)[0];
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
