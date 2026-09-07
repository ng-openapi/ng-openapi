/**
 * Names of the injection tokens emitted into each client's tokens/index.ts.
 * The client name is normalized to SCREAMING_SNAKE (non-alphanumerics → `_`)
 * and suffixed, so multiple clients can coexist in one application
 * (`"PetsApi"` → `BASE_PATH_PETSAPI`); the default client uses `_DEFAULT`.
 */

import { capitalizeFirst, isValidIdentifier, pascalCase } from "../string.utils";

/**
 * The client name generation actually uses. `""` counts as unset: one site
 * used `|| "default"` and two used a default parameter (which fires only on
 * undefined), so an empty clientName produced `BASE_PATH_` in the tokens file
 * and an import of `BASE_PATH_DEFAULT` in the providers — unresolvable.
 */
export function effectiveClientName(clientName?: string): string {
    return clientName ? clientName : "default";
}

/**
 * clientName as the stem of a generated identifier (`provide<Stem>Client`,
 * `<Stem>BaseInterceptor`, `<Stem>Config`).
 *
 * A name that already is an identifier is capitalized and otherwise kept
 * verbatim — `my_client` gives `provideMy_clientClient`, as it always has.
 * Sending every name through pascalCase would have renamed that to
 * `provideMyClientClient`, the function every consumer imports, for a
 * config that was valid all along. Only a name that could not have compiled
 * before (`my-client`, `my client`) is sanitized.
 */
export function clientNameIdentifier(clientName: string): string {
    return isValidIdentifier(clientName) ? capitalizeFirst(clientName) : pascalCase(clientName);
}

function tokenSuffix(clientName?: string): string {
    return effectiveClientName(clientName)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "_");
}

/** Token identifying which client a request belongs to (read by interceptors). */
export function getClientContextTokenName(clientName?: string): string {
    const clientSuffix = tokenSuffix(clientName);
    return `CLIENT_CONTEXT_TOKEN_${clientSuffix}`;
}

/** Token providing the API base path for the client. */
export function getBasePathTokenName(clientName?: string): string {
    const clientSuffix = tokenSuffix(clientName);
    return `BASE_PATH_${clientSuffix}`;
}

/** Token carrying the client's interceptor chain. */
export function getInterceptorsTokenName(clientName?: string): string {
    const clientSuffix = tokenSuffix(clientName);
    return `HTTP_INTERCEPTORS_${clientSuffix}`;
}
