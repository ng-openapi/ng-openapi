export interface SwaggerParameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie' | 'body';
    description?: string;
    required?: boolean;
    type?: string;
    schema?: any;
}

export interface SwaggerPath {
    summary?: string;
    description?: string;
    operationId?: string;
    parameters?: any[];
    responses?: any;
    requestBody?: any;
    tags?: string[];
    security?: any[];
}

export interface PolymorphicOption {
    name: string;
    properties: FormProperty[];
}

export interface FormProperty {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object' | 'array_object' | 'relationship' | 'file' | 'polymorphic';
    inputType: 'text' | 'number' | 'password' | 'email' | 'textarea' | 'checkbox' | 'slide-toggle' | 'select' | 'radio-group' | 'slider' | 'chip-list' | 'button-toggle-group' | 'datepicker' | 'file' | '';
    required: boolean;
    validators: string[];
    description?: string;
    defaultValue?: any;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    enumValues?: (string | number)[];
    min?: number;
    max?: number;
    arrayItemModelName?: string;
    nestedProperties?: FormProperty[];
    nestedObjectTypeName?: string; // e.g., 'PetCategory'
    relationResourceName?: string;
    relationDisplayField?: string,
    relationValueField?: string,
    relationServiceName?: string,
    relationListMethodName?: string,
    relationModelName?: string,
    polymorphicOptions?: PolymorphicOption[];
}

export interface ResourceAction {
    level: 'collection' | 'item';
    label: string,
    methodName: string;
    idParamName: string;
    idParamType: 'string' | 'number';
    parameters: SwaggerParameter[];
}

export interface ResourceOperation {
    methodName: string;
    idParamName: string;
    idParamType: 'string' | 'number';
    parameters: SwaggerParameter[];
}

export interface Resource {
    name: string; // "pet"
    pluralName: string; // "pets"
    titleName: string; // "Pet"
    modelName: string; // "Pet"
    createModelName: string;
    createModelRef: string;
    serviceName: string; // "PetService"
    isEditable: boolean;
    operations: {
        list?: ResourceOperation;
        create?: ResourceOperation;
        read?: ResourceOperation;
        update?: ResourceOperation;
        delete?: ResourceOperation;
    };
    actions: ResourceAction[];
    formProperties: FormProperty[];
    listColumns: string[];
    inlineInterfaces?: { name: string; definition: string; }[];
}
