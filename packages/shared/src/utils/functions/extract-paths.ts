import type { Parameter, PathInfo, RequestBody, SwaggerResponse } from "../../types/swagger.types";
import { Path } from "swagger-schema-official";

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

/** Outcome of resolving a `$ref` parameter: the component, or why not. */
export type ParameterResolution = { parameter: Parameter } | { problem: string };
export type ResolveParameter = (ref: string) => ParameterResolution;

/**
 * Flattens the spec's `paths` object into one PathInfo per (path, method)
 * pair, merging path-level parameters into each operation. Supports both
 * Swagger 2.0 and OpenAPI 3.x path items; methods outside the given list
 * (and vendor extensions) are ignored.
 */
export function extractPaths(
    swaggerPaths: { [p: string]: Path } = {},
    methods = ["get", "post", "put", "patch", "delete", "options", "head"],
    onWarning?: (message: string) => void,
    resolveParameter?: ResolveParameter,
): PathInfo[] {
    const paths: PathInfo[] = [];
    Object.entries(swaggerPaths as Record<string, RawPathItem>).forEach(([path, pathItem]) => {
        methods.forEach((method) => {
            const operation = pathItem[method] as RawOperation | undefined;
            if (operation) {
                paths.push({
                    path,
                    method: method.toUpperCase(),
                    operationId: asName(operation.operationId),
                    summary: operation.summary,
                    description: operation.description,
                    tags: Array.isArray(operation.tags) ? operation.tags.flatMap(nameOrNothing) : [],
                    parameters: parseParameters(
                        operation.parameters || [],
                        pathItem.parameters || [],
                        `(${method.toUpperCase()}) ${path}`,
                        onWarning,
                        resolveParameter,
                    ),
                    requestBody: operation.requestBody,
                    responses: operation.responses || {},
                });
            }
        });
    });

    return paths;
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
    resolveParameter?: ResolveParameter,
): Parameter[] {
    const allParams = [...pathParams, ...operationParams].flatMap((param): Parameter[] => {
        // A `$ref` parameter has no name of its own — the referenced component
        // does. Resolving it here means it is generated; before, it was reported
        // as "no usable name", which sent users hunting for a problem that was
        // not there, and then dropped.
        const ref = (param as { $ref?: unknown }).$ref;
        if (typeof ref !== "string") {
            return [param];
        }
        const resolution = resolveParameter?.(ref) ?? {
            problem: "cannot be resolved here: no reusable parameters were provided",
        };
        if ("parameter" in resolution) {
            return [resolution.parameter];
        }
        // The resolver says why — an external document, a pointer to
        // something that is not a parameter, a missing name, a cycle — so
        // the user is sent to the actual problem, not a generic one.
        onWarning?.(
            `A parameter of ${location} references "${ref}", which ${resolution.problem}. The parameter was skipped.`,
        );
        return [];
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
