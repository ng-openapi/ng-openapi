import {GeneratorConfig} from "../types";

export const GENERATOR_CONFIG: GeneratorConfig = {
    input: './packages/ng-openapi/src/lib/swagger.json',
    output: './client',
    options: {
        enumStyle: 'enum',
        generateEnumBasedOnDescription: true,
        dateType: 'Date', // Changed to Date
        customHeaders: { // Add default custom headers
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json'
        },
        responseTypeMapping: { // Add response type mappings
            'application/pdf': 'blob',
            'application/zip': 'blob',
            'text/csv': 'text',
            'application/vnd.ms-excel': 'blob'
        },
        customizeMethodName: (operationId) => {
            return operationId.split("_").at(-1) ?? operationId;
        }
    }
};