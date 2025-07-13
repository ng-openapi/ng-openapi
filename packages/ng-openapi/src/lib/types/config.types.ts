import {ModuleKind, ScriptTarget} from "ts-morph";

export interface GeneratorConfig {
    input: string;
    output: string;
    options: {
        dateType: 'string' | 'Date';
        enumStyle: 'enum' | 'union'; //TODO: add implementation
        generateServices?: boolean; // New option to control service generation
        generateEnumBasedOnDescription?: boolean;
        customHeaders?: Record<string, string>; // New option
        responseTypeMapping?: { // New option
            [contentType: string]: 'json' | 'blob' | 'arraybuffer' | 'text';
        };
        customizeMethodName?: (operationId: string) => string;
    };
    compilerOptions?: {
        declaration?: boolean;
        target?: ScriptTarget;
        module?: ModuleKind;
        strict?: boolean;
    }
}