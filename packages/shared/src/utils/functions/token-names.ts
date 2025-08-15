export function getClientContextTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    return `CLIENT_CONTEXT_TOKEN_${clientSuffix}`;
}

export function getBasePathTokenName(clientName = "default"): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    return `BASE_PATH_${clientSuffix}`;
}
