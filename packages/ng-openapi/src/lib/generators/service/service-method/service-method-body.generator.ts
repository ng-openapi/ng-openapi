import {OptionalKind, ParameterDeclarationStructure} from "ts-morph";
import {MethodGenerationContext, PathInfo} from "../../../types";
import {
    getFormDataFields,
    getRequestBodyType,
    getResponseTypeFromResponse,
    isMultipartFormData
} from "../service-method.generator";
import {GENERATOR_CONFIG} from "../../../config";
import {isDataTypeInterface} from "./service-method-params.generator";
import {camelCase} from "../../../utils";

export function generateMethodBody(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[]): string {
    const context = createGenerationContext(operation);

    const bodyParts = [
        generateUrlConstruction(operation, context),
        generateQueryParams(context),
        generateHeaders(context),
        generateMultipartFormData(operation, context),
        generateRequestOptions(operation, context, parameters),
        generateHttpRequest(operation, context)
    ];

    return bodyParts.filter(Boolean).join('\n');
}

function createGenerationContext(operation: PathInfo): MethodGenerationContext {
    return {
        pathParams: operation.parameters?.filter(p => p.in === 'path') || [],
        queryParams: operation.parameters?.filter(p => p.in === 'query') || [],
        hasBody: !!operation.requestBody,
        isMultipart: isMultipartFormData(operation),
        formDataFields: getFormDataFields(operation),
        responseType: determineResponseType(operation)
    };
}

function generateUrlConstruction(operation: PathInfo, context: MethodGenerationContext): string {
    let urlExpression = `\`\${this.basePath}${operation.path}\``;

    if (context.pathParams.length > 0) {
        context.pathParams.forEach(param => {
            urlExpression = urlExpression.replace(`{${param.name}}`, `\${${param.name}}`);
        });
    }

    return `const url = ${urlExpression};`;
}

function generateQueryParams(context: MethodGenerationContext): string {
    if (context.queryParams.length === 0) {
        return '';
    }

    const paramMappings = context.queryParams.map(param =>
        `if (${param.name} !== undefined) {
  params = params.set('${param.name}', String(${param.name}));
}`
    ).join('\n');

    return `
let params = new HttpParams();
${paramMappings}`;
}

function generateHeaders(context: MethodGenerationContext): string {
    const hasCustomHeaders = GENERATOR_CONFIG.options.customHeaders;

    // Always generate headers if we have custom headers or if it's multipart
    if (!hasCustomHeaders && !context.isMultipart) {
        return '';
    }

    // Use the approach that handles both HttpHeaders and plain objects
    let headerCode = `
let headers: HttpHeaders;
if (options?.headers instanceof HttpHeaders) {
  headers = options.headers;
} else {
  headers = new HttpHeaders(options?.headers);
}`;

    if (hasCustomHeaders) {
        // Add default headers
        headerCode += `
// Add default headers if not already present
${Object.entries(GENERATOR_CONFIG.options.customHeaders || {}).map(([key, value]) =>
            `if (!headers.has('${key}')) {
  headers = headers.set('${key}', '${value}');
}`
        ).join('\n')}`;
    }

    // For multipart, ensure Content-Type is not set (browser sets it with boundary)
    if (context.isMultipart) {
        headerCode += `
// Remove Content-Type for multipart (browser will set it with boundary)
headers = headers.delete('Content-Type');`;
    } else if (!context.isMultipart) {
        // For non-multipart requests, set JSON content type if not already set
        headerCode += `
// Set Content-Type for JSON requests if not already set
if (!headers.has('Content-Type')) {
  headers = headers.set('Content-Type', 'application/json');
}`;
    }

    return headerCode;
}

function generateMultipartFormData(operation: PathInfo, context: MethodGenerationContext): string {
    if (!context.isMultipart || context.formDataFields.length === 0) {
        return '';
    }

    const formDataAppends = context.formDataFields.map(field => {
        const fieldSchema = operation.requestBody?.content?.["multipart/form-data"]?.schema?.properties?.[field];
        const isFile = fieldSchema?.type === 'string' && fieldSchema?.format === 'binary';

        const valueExpression = isFile ? field : `String(${field})`;

        return `if (${field} !== undefined) {
  formData.append('${field}', ${valueExpression});
}`;
    }).join('\n');

    return `
const formData = new FormData();
${formDataAppends}`;
}

function generateRequestOptions(operation: PathInfo, context: MethodGenerationContext, parameters: OptionalKind<ParameterDeclarationStructure>[]): string {
    const options: string[] = [];

    // Always include observe
    options.push('observe: observe as any');

    // Add headers if we generated them
    const hasHeaders = GENERATOR_CONFIG.options.customHeaders || context.isMultipart;
    if (hasHeaders) {
        options.push('headers');
    }

    // Add params if we have query parameters
    if (context.queryParams.length > 0) {
        options.push('params');
    }

    // Add response type if not JSON
    if (context.responseType !== 'json') {
        options.push(`responseType: '${context.responseType}' as '${context.responseType}'`);
    }

    // Add other options from the parameter
    options.push('reportProgress: options?.reportProgress');
    options.push('withCredentials: options?.withCredentials');

    // Handle context - it might be undefined
    if (options.length > 0) {
        options.push('context: options?.context');
    }

    const formattedOptions = options.filter(opt => opt && !opt.includes('undefined')).join(',\n  ');

    return `
const requestOptions: any = {
  ${formattedOptions}
};`;
}

function generateHttpRequest(operation: PathInfo, context: MethodGenerationContext): string {
    const httpMethod = operation.method.toLowerCase();

    // Determine if we need body parameter
    let bodyParam = '';
    if (context.hasBody) {
        if (context.isMultipart) {
            bodyParam = 'formData';
        } else if (operation.requestBody?.content?.["application/json"]) {
            const bodyType = getRequestBodyType(operation.requestBody);
            const isInterface = isDataTypeInterface(bodyType);
            bodyParam = isInterface ? camelCase(bodyType) : 'requestBody';
        }
    }

    // Methods that require body
    const methodsWithBody = ['post', 'put', 'patch'];

    if (methodsWithBody.includes(httpMethod)) {
        return `
return this.httpClient.${httpMethod}(url, ${bodyParam || 'null'}, requestOptions);`;
    } else {
        return `
return this.httpClient.${httpMethod}(url, requestOptions);`;
    }
}

function determineResponseType(operation: PathInfo): 'json' | 'blob' | 'arraybuffer' | 'text' {
    const successResponses = ['200', '201', '202', '204', '206']; // Added 206 for partial content

    for (const statusCode of successResponses) {
        const response = operation.responses?.[statusCode];
        if (!response) continue;

        // Use the new function that checks both content type and schema
        return getResponseTypeFromResponse(response, GENERATOR_CONFIG);
    }

    return 'json';
}