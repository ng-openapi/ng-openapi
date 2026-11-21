import type { NormalizedOperation } from "../model/operation.model";
import type { ArgumentNames } from "../utils/functions/argument-names";
import { deriveLocalName } from "../utils/functions/argument-names";
import { quoteLiteral } from "./literal.emit";
import { signalAwareParamValue } from "./url.emit";

export interface FormBodyEmitOptions {
    /**
     * Identifier of the `FormData` / `URLSearchParams` local the fields are
     * appended to. The caller picks it, because which names are free depends
     * on what else its method binds: the core service reserves `formData` /
     * `formBody` in its argument profile, the http-resource plugin derives one
     * that avoids its arguments.
     */
    container: string;
    /**
     * True when the arguments may be signals (http-resource): each field is
     * read once into a local before it is tested and appended.
     */
    signalAware?: boolean;
}

/** One form field as the block sees it: where its value is, and what had to be declared to get it. */
interface FieldRead {
    declaration: string;
    value: string;
}

/**
 * `field` is the wire name and only ever lands inside a string literal; the
 * identifier comes from `argumentNames`, the only thing that may appear in
 * expression position (#125).
 *
 * The signal-aware temp is suffixed `Field`, not `Value` like the query-param
 * temps of `emitSignalAwareQueryParams`: both blocks share one function scope,
 * and a wire name declared as a query parameter *and* a form field collapses
 * onto one argument — a shared suffix would declare its temp twice.
 */
function readField(field: string, argumentNames: ArgumentNames, signalAware: boolean | undefined): FieldRead {
    const argument = argumentNames.of(field);
    if (!signalAware) {
        return { declaration: "", value: argument };
    }
    const local = deriveLocalName(`${argument}Field`, argumentNames.all);
    return { declaration: `const ${local} = ${signalAwareParamValue(argument)};\n`, value: local };
}

/**
 * Emits the `FormData` block of a `multipart/form-data` body: one append per
 * top-level field, files passed through and everything else stringified.
 * Returns "" when the operation sends no multipart body.
 */
export function emitMultipartFormData(
    operation: Pick<NormalizedOperation, "bodyKind" | "formDataFields" | "formDataSchema">,
    argumentNames: ArgumentNames,
    options: FormBodyEmitOptions,
): string {
    if (operation.bodyKind !== "multipart") {
        return "";
    }

    const { container, signalAware } = options;
    const properties = operation.formDataSchema?.properties || {};

    const formDataAppends = operation.formDataFields
        .map((field) => {
            const fieldSchema = properties[field];
            const isFile = fieldSchema?.type === "string" && fieldSchema?.format === "binary";
            const isArray = fieldSchema?.type === "array";
            const { declaration, value } = readField(field, argumentNames, signalAware);

            if (isArray) {
                const itemSchema = Array.isArray(fieldSchema.items) ? fieldSchema.items[0] : fieldSchema.items;
                const isFileArray = itemSchema?.type === "string" && itemSchema?.format === "binary";

                const valueExpression = isFileArray ? "item" : "String(item)";

                return `${declaration}if (${value} !== undefined && Array.isArray(${value})) {
                  ${value}.forEach((item) => {
                    if (item !== undefined && item !== null) {
                      ${container}.append(${quoteLiteral(field)}, ${valueExpression});
                    }
                  });
                }`;
            } else {
                const valueExpression = isFile ? value : `String(${value})`;

                return `${declaration}if (${value} !== undefined) {
                  ${container}.append(${quoteLiteral(field)}, ${valueExpression});
                }`;
            }
        })
        .join("\n");

    return `
const ${container} = new FormData();
${formDataAppends}`;
}

/**
 * Emits the `URLSearchParams` block of an `application/x-www-form-urlencoded`
 * body. Returns "" when the operation sends no urlencoded body.
 */
export function emitUrlEncodedFormBody(
    operation: Pick<NormalizedOperation, "bodyKind" | "urlEncodedFields" | "urlEncodedSchema">,
    argumentNames: ArgumentNames,
    options: FormBodyEmitOptions,
): string {
    if (operation.bodyKind !== "urlencoded") {
        return "";
    }

    const { container, signalAware } = options;
    const properties = operation.urlEncodedSchema?.properties || {};

    const formBodyAppends = operation.urlEncodedFields
        .map((field) => {
            const fieldSchema = properties[field];
            const isArray = fieldSchema?.type === "array";
            const { declaration, value } = readField(field, argumentNames, signalAware);

            if (isArray) {
                return `${declaration}if (${value} !== undefined && Array.isArray(${value})) {
                  ${value}.forEach((item) => {
                    if (item !== undefined && item !== null) {
                      ${container}.append(${quoteLiteral(field)}, String(item));
                    }
                  });
                }`;
            } else {
                return `${declaration}if (${value} !== undefined && ${value} !== null) {
                  ${container}.append(${quoteLiteral(field)}, String(${value}));
                }`;
            }
        })
        .join("\n");

    return `
const ${container} = new URLSearchParams();
${formBodyAppends}`;
}
