/**
 * Names of the injection tokens emitted into each client's tokens/index.ts.
 * The client name is normalized to SCREAMING_SNAKE (non-alphanumerics → `_`)
 * and suffixed, so multiple clients can coexist in one application
 * (`"PetsApi"` → `BASE_PATH_PETSAPI`); the default client uses `_DEFAULT`.
 */

/** Token identifying which client a request belongs to (read by interceptors). */
export function getClientContextTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    return `CLIENT_CONTEXT_TOKEN_${clientSuffix}`;
}

/** Token providing the API base path for the client. */
export function getBasePathTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    return `BASE_PATH_${clientSuffix}`;
}

/** Token carrying the client's interceptor chain. */
export function getInterceptorsTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    return `HTTP_INTERCEPTORS_${clientSuffix}`;
}
