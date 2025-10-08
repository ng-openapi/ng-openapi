/**
 * Represents a form field derived from an OpenAPI schema property.
 */
export interface FormProperty {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'enum' | 'array';
    inputType: 'text' | 'number' | 'checkbox' | 'datepicker' | 'select' | 'textarea' | 'slider' | 'password' | 'slide-toggle' | 'radio-group' | 'chip-list' | 'button-toggle-group';
    required: boolean;
    validators: string[];
    description?: string;
    defaultValue?: any; // <-- ADDED
    // For enum, select, radio, button-toggle
    enumValues?: (string | number)[];
    // For slider
    min?: number;
    max?: number;
    // For inputs
    minLength?: number;
    maxLength?: number;
    pattern?: string;
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
