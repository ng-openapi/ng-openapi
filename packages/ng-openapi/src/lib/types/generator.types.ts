export interface MethodGenerationContext {
    pathParams: Array<{ name: string; in: string }>;
    queryParams: Array<{ name: string; in: string }>;
    hasBody: boolean;
    isMultipart: boolean;
    formDataFields: string[];
    responseType: 'json' | 'blob' | 'arraybuffer' | 'text';
}

export interface TypeSchema {
    type?: string;
    format?: string;
    $ref?: string;
    items?: any;
    nullable?: boolean;

    [key: string]: any;
}