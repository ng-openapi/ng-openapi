/**
 * Represents a form field derived from an OpenAPI schema property.
 */
export interface FormProperty {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'enum';
    inputType: 'text' | 'number' | 'checkbox' | 'datetime-local';
    required: boolean;
    validators: string[];
    enumValues?: (string | number)[];
}

/**
 * Represents a single REST operation mapped to a service method.
 */
interface ResourceOperation {
    methodName: string;
    idParamName?: string;
}

/**
 * Represents a RESTful resource identified from the OpenAPI specification.
 */
export interface Resource {
    name: string; // "user"
    className: string; // "User"
    pluralName: string; // "users"
    titleName: string; // "User"
    serviceName: string; // "UsersService"
    modelName: string;
    operations: {
        list?: ResourceOperation;
        create?: ResourceOperation;
        read?: ResourceOperation;
        update?: ResourceOperation;
        delete?: ResourceOperation;
    };
    formProperties: FormProperty[];
    listColumns: string[];
}
