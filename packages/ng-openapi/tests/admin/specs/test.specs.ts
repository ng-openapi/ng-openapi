const info = { title: 'API', version: '1.0.0' };

const basicControlsSpecObj = {
    openapi: '3.0.0',
    info: { ...info, title: 'Basic Controls API' },
    paths: {
        '/widgets': {
            post: {
                tags: ['Widgets'],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateWidget' } } } }
            }
        }
    },
    components: {
        schemas: {
            CreateWidget: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string', minLength: 3 },
                    description: { type: 'string', format: 'textarea' },
                    stock: { type: 'integer', minimum: 0, maximum: 100 },
                    isPublic: { type: 'boolean', default: false },
                    status: { type: 'string', enum: ['Pending', 'Active', 'Inactive', 'Archived', 'Obsolete'] },
                    priority: { type: 'string', enum: ['Low', 'Medium', 'High'] },
                    tags: { type: 'array', items: { type: 'string' } },
                    categories: { type: 'array', items: { type: 'string', enum: ['Tech', 'Health', 'Finance', 'Art'] } },
                    launchDate: { type: 'string', format: 'date' }
                }
            }
        }
    }
};

const advancedStructuresSpecObj = {
    openapi: '3.0.0',
    info: { ...info, title: 'Advanced Structures API' },
    paths: {
        '/projects': {
            post: { tags: ['Projects'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateProject' } } } } }
        },
        '/projects/{id}': {
            get: { tags: ['Projects'], parameters: [{ name: 'id', in: 'path' }] },
            put: { tags: ['Projects'], parameters: [{ name: 'id', in: 'path' }] }
        }
    },
    components: {
        schemas: {
            CreateProject: {
                type: 'object',
                required: ['projectName', 'milestones'],
                properties: {
                    id: { type: 'string', readOnly: true },
                    projectName: { type: 'string' },
                    contactPerson: { $ref: '#/components/schemas/Contact' },
                    milestones: { type: 'array', items: { $ref: '#/components/schemas/Milestone' } }
                }
            },
            Contact: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, email: { type: 'string' } } },
            Milestone: { type: 'object', properties: { title: { type: 'string' }, dueDate: { type: 'string', format: 'date' } } }
        }
    }
};

const defaultValueSpecObj = {
    openapi: '3.0.0',
    info: { ...info, title: 'Default Value API' },
    paths: {
        '/configs': {
            post: { tags: ['Configs'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateConfig' } } } } }
        }
    },
    components: {
        schemas: {
            CreateConfig: {
                type: 'object',
                properties: {
                    name: { type: 'string', default: 'Default Name' },
                    retries: { type: 'number', default: 3 },
                    isEnabled: { type: 'boolean', default: true },
                    flags: { type: 'array', items: { type: 'string' }, default: ['A', 'B'] },
                    unassigned: { type: 'string' }
                }
            }
        }
    }
};

const fullE2ESpecObj = {
    openapi: '3.0.0',
    info: { ...info, title: 'Full E2E API' },
    paths: {
        '/books': {
            get: { tags: ['Books'], responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Book' } } } } } } },
            post: { tags: ['Books'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateBook' } } } } }
        },
        '/books/{id}': {
            get: { tags: ['Books'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }] },
            put: {
                tags: ['Books'],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateBook' } } } }
            },
            delete: { tags: ['Books'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }] }
        },
        '/authors': {
            get: { tags: ['Authors'], responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Author' } } } } } } }
        },
        '/publishers': {
            post: { tags: ['Publishers'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatePublisher' } } } } }
        },
        '/servers': { get: { tags: ['Servers'], summary: 'List Servers' } },
        '/servers/{serverId}': { get: { tags: ['Servers'], summary: 'Get Server' } },
        '/servers/{serverId}/reboot': { post: { tags: ['Servers'], summary: 'Reboot Server', operationId: 'rebootServer', parameters: [{ name: 'serverId', in: 'path' }] } },
        '/servers/reindex': { post: { tags: ['Servers'], summary: 'Reindex SERVERS', operationId: 'reindexAll' } },
        '/logs': {
            get: { tags: ['Logs'], responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Log' } } } } } } }
        },
        '/logs/{logId}': {
            get: { tags: ['Logs'], parameters: [{ name: 'logId', in: 'path' }] }
        }
    },
    components: {
        schemas: {
            Book: { type: 'object', properties: { id: { type: 'integer' }, title: { type: 'string' } } },
            CreateBook: { type: 'object', properties: { title: { type: 'string' }, author: { $ref: '#/components/schemas/Author' } } },
            Author: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
            CreatePublisher: { type: 'object', properties: { name: { type: 'string' } } },
            Log: { type: 'object', properties: { message: { type: 'string' } } },
            Server: { type: 'object', properties: { id: { type: 'string' } } }
        }
    }
};

export const securitySpecObj = {
    openapi: '3.0.0',
    info: { title: 'Security Test API', version: '1.0' },
    paths: {
        '/secure/path': {
            get: {
                tags: ['Secure'],
                summary: 'A protected endpoint',
                security: [{ ApiKeyAuth: [] }],
                responses: { '200': { description: 'OK' } }
            }
        }
    },
    components: {
        securitySchemes: {
            ApiKeyAuth: {
                type: 'apiKey',
                in: 'header',
                name: 'X-API-KEY'
            }
        }
    }
};

const petstoreUploadSpecObj = {
    openapi: '3.0.0',
    info: { ...info, title: 'File Upload API' },
    paths: {
        '/pets': {
            get: { tags: ['Pets'], operationId: 'listPets', responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } } } } },
            post: {
                tags: ['Pets'],
                operationId: 'createPet',
                requestBody: {
                    content: {
                        'multipart/form-data': {
                            schema: { $ref: '#/components/schemas/CreatePet' }
                        }
                    }
                }
            }
        }
    },
    components: {
        schemas: {
            Pet: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
            CreatePet: {
                type: 'object',
                required: ['name', 'photo'],
                properties: {
                    name: { type: 'string' },
                    photo: { type: 'string', format: 'binary', description: 'The pet\'s photo' }
                }
            }
        }
    }
};

const paginationAndSortSpecObj = {
    openapi: '3.0.0',
    info: { ...info, title: 'Pagination & Sort API' },
    paths: {
        '/items': {
            get: {
                tags: ['Items'],
                operationId: 'listItems',
                parameters: [
                    { name: 'page', in: 'query', schema: { type: 'integer' } },
                    { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
                    { name: 'sort', in: 'query', schema: { type: 'string' } },
                    { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
                    { name: 'search', in: 'query', schema: { type: 'string' } },
                ],
                responses: { '200': {
                        headers: { 'X-Total-Count': { schema: { type: 'integer' } } },
                        content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Item' } } } }
                    }}
            }
        }
    },
    components: {
        schemas: {
            Item: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } }
        }
    }
};

const advancedValidationSpecObj = {
    openapi: '3.0.0',
    info: { ...info, title: 'Advanced Validation API' },
    paths: {
        '/items': {
            post: { tags: ['Items'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateItem' } } } } }
        }
    },
    components: {
        schemas: {
            CreateItem: {
                type: 'object',
                required: ['quantity'],
                properties: {
                    quantity: { type: 'integer', minimum: 1, maximum: 100 },
                    // FIX: Correctly define exclusiveMinimum/Maximum as boolean flags modifying minimum/maximum.
                    price: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 1000, exclusiveMaximum: true },
                    step: { type: 'number', multipleOf: 5 },
                    tags: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 },
                    categories: { type: 'array', items: { type: 'string' }, uniqueItems: true }
                }
            }
        }
    }
};

const polymorphismSpecObj = {
    openapi: '3.0.0',
    info: { ...info, title: 'Polymorphism API' },
    paths: {
        '/containers': {
            post: { tags: ['Containers'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateContainer' } } } } }
        }
    },
    components: {
        schemas: {
            CreateContainer: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    item: {
                        oneOf: [
                            { $ref: '#/components/schemas/Cat' },
                            { $ref: '#/components/schemas/Dog' }
                        ]
                    }
                }
            },
            Cat: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string' },
                    meowVolume: { type: 'integer' }
                }
            },
            Dog: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string' },
                    barkPitch: { type: 'number' }
                }
            }
        }
    }
};

export const basicControlsSpec = JSON.stringify(basicControlsSpecObj);
export const advancedStructuresSpec = JSON.stringify(advancedStructuresSpecObj);
export const defaultValueSpec = JSON.stringify(defaultValueSpecObj);
export const fullE2ESpec = JSON.stringify(fullE2ESpecObj);
export const securitySpec = JSON.stringify(securitySpecObj);
export const petstoreUploadSpec = JSON.stringify(petstoreUploadSpecObj);
export const paginationAndSortSpec = JSON.stringify(paginationAndSortSpecObj);
export const advancedValidationSpec = JSON.stringify(advancedValidationSpecObj);
export const polymorphismSpec = JSON.stringify(polymorphismSpecObj);
