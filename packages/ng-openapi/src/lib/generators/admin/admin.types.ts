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
    contentType?: 'application/json' | 'multipart/form-data';
    hasPagination?: boolean;
    hasSorting?: boolean;
}

export interface ActionOperation {
    label: string; // e.g., "Reboot Server"
    methodName: string; // e.g., "serversidRebootPOST"
    level: 'item' | 'collection';
    path: string; // The raw path, e.g., /servers/{id}/reboot
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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
    isEditable: boolean; // NEW: True if create or update ops exist
    operations: {
        list?: ResourceOperation;
        create?: ResourceOperation;
        read?: ResourceOperation;
        update?: ResourceOperation;
        delete?: ResourceOperation;
    };
    actions: ActionOperation[];
    formProperties: FormProperty[];
    listColumns: string[];
}

export interface PolymorphicOption {
    name: string;
    properties: FormProperty[];
}

export interface FormProperty {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object' | 'array_object' | 'relationship' | 'file' | 'polymorphic';
    inputType?: 'text' | 'number' | 'password' | 'email' | 'textarea' | 'checkbox' | 'slide-toggle' | 'select' | 'radio-group' | 'slider' | 'chip-list' | 'button-toggle-group' | 'datepicker' | 'file' | '';
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
    polymorphicOptions?: PolymorphicOption[]; // NEW
    relationResourceName?: string;
    relationDisplayField?: string;
    relationValueField?: string;
    relationServiceName?: string;
    relationListMethodName?: string;
    relationModelName?: string;
}
