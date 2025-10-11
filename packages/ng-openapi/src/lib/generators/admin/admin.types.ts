// packages/ng-openapi/src/lib/generators/admin/admin.types.ts

export interface FilterParameter {
    name: string;
    inputType: 'text' | 'select' | 'number' | 'boolean';
    enumValues?: string[];
}

export interface ResourceOperation {
    methodName: string;
    idParamName?: string;
    bodyParamName?: string;
    filterParameters?: FilterParameter[];
}

export interface Resource {
    name: string; // e.g. 'pet'
    pluralName: string; // e.g. 'pets'
    className: string; // e.g. 'Pet'
    titleName: string; // e.g. 'Pet'
    serviceName: string; // e.g. 'PetService'
    modelName: string; // e.g. 'Pet'
    createModelName: string; // e.g. 'CreatePet'
    createModelRef: string | undefined; // '#/components/schemas/CreatePet'
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

export interface FormProperty {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object' | 'array_object' | 'relationship';
    inputType?: 'text' | 'number' | 'password' | 'email' | 'textarea' | 'checkbox' | 'slide-toggle' | 'select' | 'radio-group' | 'slider' | 'chip-list' | 'button-toggle-group' | 'datepicker' | '';
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
    nestedProperties?: FormProperty[];
    relationResourceName?: string;
    relationDisplayField?: string;
    relationValueField?: string;
    relationServiceName?: string;
    relationListMethodName?: string;
    relationModelName?: string;
}
