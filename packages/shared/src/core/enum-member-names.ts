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

    for (const extension of enumNameExtensions) {
        const names = namesFromExtension(definition, extension, values.length, warn);
        if (names) {
            return names;
        }
    }
    return generateEnumBasedOnDescription ? namesFromDescription(definition.description, values, warn) : undefined;
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
    return toMemberNames(`\`${extension}\``, candidates, warn);
}

function namesFromDescription(description: unknown, values: unknown[], warn: Warn): string[] | undefined {
    if (typeof description !== "string") {
        return undefined;
    }
    // Prose descriptions are expected to land here silently; only a
    // description that looks like the JSON payload warrants a warning.
    const reject = (reason: string): undefined => {
        if (/^\s*[[{]/.test(description)) {
            warn(
                `description looks like JSON (generateEnumBasedOnDescription) but could not be used: ${reason} — falling back to raw enum values`,
            );
        }
        return undefined;
    };

    let parsed: unknown;
    try {
        parsed = JSON.parse(description);
    } catch {
        return reject("it does not parse");
    }
    if (!Array.isArray(parsed) || !parsed.every(isEnumValueObject)) {
        return reject('expected an array of { "Name": string, "Value": string | number } objects');
    }

    // The first entry for a Value names it.
    const nameByValue = new Map<unknown, string>();
    for (const { Name, Value } of parsed) {
        if (!nameByValue.has(Value)) {
            nameByValue.set(Value, Name);
        }
    }
    const candidates: string[] = [];
    for (const value of values) {
        const name = nameByValue.get(value);
        if (name === undefined) {
            return reject(`no Name for enum value ${JSON.stringify(value)}`);
        }
        candidates.push(name);
    }
    return toMemberNames("the description", candidates, warn);
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
function toMemberNames(source: string, candidates: string[], warn: Warn): string[] | undefined {
    const names = candidates.map(toMemberName);
    const seen = new Set<string>();
    for (const name of names) {
        if (seen.has(name)) {
            warn(
                `names from ${source} are not unique ("${name}" occurs more than once) — falling back to raw enum values`,
            );
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
