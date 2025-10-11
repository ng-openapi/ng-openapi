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
            get: { tags: ['Books'], parameters: [{ name: 'id', in: 'path' }] },
            put: { tags: ['Books'], parameters: [{ name: 'id', in: 'path' }] },
            delete: { tags: ['Books'], parameters: [{ name: 'id', in: 'path' }] }
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

export const basicControlsSpec = JSON.stringify(basicControlsSpecObj);
export const advancedStructuresSpec = JSON.stringify(advancedStructuresSpecObj);
export const defaultValueSpec = JSON.stringify(defaultValueSpecObj);
export const fullE2ESpec = JSON.stringify(fullE2ESpecObj);
