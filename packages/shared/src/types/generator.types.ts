export interface MethodGenerationContext {
    pathParams: Array<{ name: string; in: string }>;
    queryParams: Array<{ name: string; in: string }>;
    hasBody: boolean;
    isMultipart: boolean;
    isUrlEncoded: boolean;
    formDataFields: string[];
    urlEncodedFields: string[];
    responseType: "json" | "blob" | "arraybuffer" | "text";
}

export interface TypeSchema {
    type?: string;
    format?: string;
    $ref?: string;
    items?: any;
    nullable?: boolean;
    enum?: Array<string | number>;

    [key: string]: any;
}

export interface GetMethodGenerationContext {
    pathParams: Array<{ name: string; in: string }>;
    queryParams: Array<{ name: string; in: string }>;
    responseType: "json" | "blob" | "arraybuffer" | "text";
}
