import { ModuleKind, ScriptTarget } from "ts-morph";

export interface GeneratorConfig {
    input: string;
    output: string;
    clientName?: string;
    options: {
        dateType: "string" | "Date";
        enumStyle: "enum" | "union";
        generateServices?: boolean;
        generateEnumBasedOnDescription?: boolean;
        customHeaders?: Record<string, string>;
        responseTypeMapping?: {
            [contentType: string]: "json" | "blob" | "arraybuffer" | "text";
        };
        customizeMethodName?: (operationId: string) => string;
    };
    compilerOptions?: {
        declaration?: boolean;
        target?: ScriptTarget;
        module?: ModuleKind;
        strict?: boolean;
    };
}
