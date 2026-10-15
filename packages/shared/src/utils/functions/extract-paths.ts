import type { Parameter, PathInfo, RequestBody, SwaggerResponse } from "../../types/swagger.types";
import { Path } from "swagger-schema-official";
import { describeOperation } from "../../errors";
import type { ComponentResolvers, ResolveComponent } from "./component-resolver";

/**
 * The raw operation shape as it appears in the spec: only the fields
 * extractPaths reads, all optional because the raw spec may omit any of them.
 * RawPathItem below is the loose boundary between untyped spec JSON and the
 * typed PathInfo the generators consume.
 */
interface RawOperation {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: Parameter[];
    requestBody?: RequestBody;
    responses?: Record<string, SwaggerResponse>;
}

type RawPathItem = { parameters?: Parameter[] } & { [method: string]: unknown };

/**
 * Flattens the spec's `paths` object into one PathInfo per (path, method)
 * pair, merging path-level parameters into each operation. Supports both
 * Swagger 2.0 and OpenAPI 3.x path items; methods outside the given list
 * (and vendor extensions) are ignored.
 *
 * `$ref` parameters, request bodies and responses are replaced by the
 * component they point to, so no consumer of a PathInfo ever sees one. A ref
 * that does not resolve is warned about and left out.
 */
export function extractPaths(
    swaggerPaths: { [p: string]: Path } = {},
    methods = ["get", "post", "put", "patch", "delete", "options", "head"],
    onWarning?: (message: string) => void,
    resolvers: ComponentResolvers = {},
): PathInfo[] {
    const paths: PathInfo[] = [];
    Object.entries(swaggerPaths as Record<string, RawPathItem>).forEach(([path, pathItem]) => {
        methods.forEach((method) => {
            const operation = pathItem[method] as RawOperation | undefined;
            if (operation) {
                const operationRef = { path, method: method.toUpperCase(), operationId: asName(operation.operationId) };
                const described = describeOperation(operationRef);
                paths.push({
                    ...operationRef,
                    summary: operation.summary,
                    description: operation.description,
                    tags: Array.isArray(operation.tags) ? operation.tags.flatMap(nameOrNothing) : [],
                    parameters: parseParameters(
                        operation.parameters || [],
                        pathItem.parameters || [],
                        `(${operationRef.method}) ${path}`,
                        onWarning,
                        resolvers.parameter,
                    ),
                    requestBody:
                        operation.requestBody &&
                        dereference(
                            operation.requestBody,
                            resolvers.requestBody,
                            `The request body of ${described}`,
                            "The request body was skipped: generated methods take no body and no validator is generated for it.",
                            onWarning,
                        ),
                    responses: resolveResponses(operation.responses || {}, described, onWarning, resolvers.response),
                });
            }
        });
    });

    return paths;
}

/**
 * The value itself, or — when it is a Reference Object — the component it
 * points to. A ref that does not resolve yields undefined and a warning with
 * the resolver's reason (an external document, a pointer to the wrong kind of
 * component, a missing name, a cycle), so the user is sent to the actual
 * problem, not a generic one.
 */
function dereference<T>(
    value: T,
    resolve: ResolveComponent<T> | undefined,
    subject: string,
    skipped: string,
    onWarning?: (message: string) => void,
): T | undefined {
    const ref = (value as { $ref?: unknown } | null | undefined)?.$ref;
    if (typeof ref !== "string") {
        return value;
    }
    const resolution = resolve?.(ref) ?? { problem: "cannot be resolved here: no resolver for it was provided" };
    if ("value" in resolution) {
        return resolution.value;
    }
    onWarning?.(`${subject} references "${ref}", which ${resolution.problem}. ${skipped}`);
    return undefined;
}

function resolveResponses(
    responses: Record<string, SwaggerResponse>,
    operation: string,
    onWarning?: (message: string) => void,
    resolveResponse?: ResolveComponent<SwaggerResponse>,
): Record<string, SwaggerResponse> {
    // fromEntries, not assignment: a "__proto__" status key would hit the
    // prototype setter and vanish.
    return Object.fromEntries(
        Object.entries(responses).flatMap(([status, response]) => {
            const resolved = dereference(
                response,
                resolveResponse,
                `The "${status}" response of ${operation}`,
                "The response was skipped: no return type or validator is generated from it.",
                onWarning,
            );
            return resolved === undefined ? [] : [[status, resolved] as const];
        }),
    );
}

/**
 * A spec name, or undefined when the value is not usable as one.
 *
 * This is the boundary between untyped spec JSON and the typed PathInfo, and
 * nothing schema-validates the document: a numeric `operationId`, a `tags`
 * entry that is an object, or a non-string parameter name all reached the
 * generators and threw a raw TypeError out of the run from inside camelCase.
 * Numbers are kept, since a YAML `operationId: 2` is plainly meant as a name.
 */
function asName(value: unknown): string | undefined {
    if (typeof value === "string") {
        return value;
    }
    return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

/** asName as a flatMap step: an unusable entry contributes nothing. */
function nameOrNothing(value: unknown): string[] {
    const name = asName(value);
    return name === undefined ? [] : [name];
}

function parseParameters(
    operationParams: Parameter[],
    pathParams: Parameter[],
    location: string,
    onWarning?: (message: string) => void,
    resolveParameter?: ResolveComponent<Parameter>,
): Parameter[] {
    const allParams = [...pathParams, ...operationParams].flatMap((param): Parameter[] => {
        // A `$ref` parameter has no name of its own — the referenced component
        // does, so it is resolved before the name check below.
        const resolved = dereference(
            param,
            resolveParameter,
            `A parameter of ${location}`,
            "The parameter was skipped.",
            onWarning,
        );
        return resolved === undefined ? [] : [resolved];
    });
    // A parameter without a usable name cannot be bound to anything. A finite
    // number is a name (a YAML `name: 42` plainly means one); an empty string,
    // or anything else that is not a string, is dropped here, out loud,
    // rather than coerced to "" — which traded a loud TypeError for silent
    // invalid TypeScript, since "" reached the signature verbatim.
    const named = allParams.filter((param) => {
        const name = asName(param.name);
        if (name !== undefined && name !== "") {
            return true;
        }
        const where = typeof param.in === "string" ? `${param.in} parameter` : "parameter";
        const shown = param.name === undefined ? "no name" : `name ${JSON.stringify(param.name)}`;
        onWarning?.(`A ${where} of ${location} has ${shown} and was skipped. Give it a name in the spec.`);
        return false;
    });
    return named.map((param) => ({
        name: asName(param.name) as string,
        in: param.in,
        required: param.required || param.in === "path",
        schema: param.schema,
        type: param.type,
        format: param.format,
        description: param.description,
    }));
}
