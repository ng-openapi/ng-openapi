import type { Parameter, RequestBody, SwaggerResponse, SwaggerSpec } from "../../types/swagger.types";
import { isPlainObject } from "./plain-object";

/** Outcome of resolving a `$ref` to a reusable component: the component, or why not. */
export type ComponentResolution<T> = { value: T } | { problem: string };
export type ResolveComponent<T> = (ref: string) => ComponentResolution<T>;

/** One resolver per component kind an operation may reference. */
export interface ComponentResolvers {
    parameter?: ResolveComponent<Parameter>;
    response?: ResolveComponent<SwaggerResponse>;
    requestBody?: ResolveComponent<RequestBody>;
}

/** Where each kind lives: a map of the document, and the pointer prefix that addresses it. */
interface ComponentLocation {
    /** Singular noun, as it reads in a warning ("no response component named …"). */
    noun: string;
    /** Absent when the spec version has no such map (Swagger 2.0 request bodies). */
    prefix?: string;
    components: Record<string, unknown>;
}

/**
 * Resolvers for every component kind an operation may reference by `$ref`:
 * parameters, responses and request bodies — `components.<kind>` in
 * OpenAPI 3, top-level `parameters`/`responses` in Swagger 2.0, which has no
 * reusable request bodies (a body there is an `in: body` parameter).
 */
export function createComponentResolvers(spec: SwaggerSpec): Required<ComponentResolvers> {
    // Read untyped: the raw spec types do not model these maps fully, and a
    // wrong shape must not throw here.
    type ComponentMap = Record<string, unknown>;
    const raw = spec as {
        parameters?: ComponentMap;
        responses?: ComponentMap;
        components?: { parameters?: ComponentMap; responses?: ComponentMap; requestBodies?: ComponentMap };
    };
    const v2 = !!spec.swagger;
    return {
        parameter: createComponentResolver<Parameter>({
            noun: "parameter",
            prefix: v2 ? "#/parameters/" : "#/components/parameters/",
            components: (v2 ? raw.parameters : raw.components?.parameters) ?? {},
        }),
        response: createComponentResolver<SwaggerResponse>({
            noun: "response",
            prefix: v2 ? "#/responses/" : "#/components/responses/",
            components: (v2 ? raw.responses : raw.components?.responses) ?? {},
        }),
        requestBody: createComponentResolver<RequestBody>({
            noun: "request body",
            prefix: v2 ? undefined : "#/components/requestBodies/",
            components: (v2 ? undefined : raw.components?.requestBodies) ?? {},
        }),
    };
}

/**
 * Matches the whole pointer, not its last segment: `#/components/schemas/Foo`
 * and `common.yaml#/components/parameters/Foo` must not bind a local
 * component that happens to be called Foo. A component may itself be a
 * Reference Object, so the chain is followed, with a cycle guard.
 */
function createComponentResolver<T>({ noun, prefix, components }: ComponentLocation): ResolveComponent<T> {
    return (ref) => {
        const chain: string[] = [];
        let current = ref;
        for (;;) {
            if (chain.includes(current)) {
                return {
                    problem: `is part of a reference cycle (${[...chain, current].map((r) => `"${r}"`).join(" -> ")})`,
                };
            }
            chain.push(current);
            const located = locate(current);
            if ("problem" in located) {
                // Name the hop that broke: with responses.A pointing at a
                // schema, "#/components/responses/A" is a fine response
                // pointer and blaming it sends the user to the wrong place.
                return {
                    problem: current === ref ? located.problem : `leads to "${current}", which ${located.problem}`,
                };
            }
            const next = located.component.$ref;
            if (typeof next === "string") {
                current = next;
                continue;
            }
            return { value: located.component as T };
        }
    };

    /** The component one pointer names, or why it names none. */
    function locate(pointer: string): { component: { $ref?: unknown } } | { problem: string } {
        const hash = pointer.indexOf("#");
        if (hash > 0) {
            return {
                problem:
                    `points into another document ("${pointer.slice(0, hash)}"); references into other documents ` +
                    "are not supported, so bundle the spec into one document first",
            };
        }
        if (prefix === undefined) {
            return { problem: `is not supported: Swagger 2.0 has no reusable ${noun} components` };
        }
        if (!pointer.startsWith(prefix)) {
            return { problem: `is not a ${noun} component pointer (expected "${prefix}<name>")` };
        }
        // JSON-pointer unescaping (RFC 6901: `~1` first, then `~0`), so a
        // component named "a/b" is reachable.
        const name = pointer.slice(prefix.length).replace(/~1/g, "/").replace(/~0/g, "~");
        if (!Object.prototype.hasOwnProperty.call(components, name)) {
            return { problem: `does not resolve: there is no ${noun} component named "${name}"` };
        }
        const component = components[name];
        if (!isPlainObject(component)) {
            return { problem: `does not resolve: the ${noun} component "${name}" is not an object` };
        }
        return { component };
    }
}
