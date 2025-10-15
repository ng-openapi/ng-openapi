import {
    SwaggerParser,
    extractPaths,
    PathInfo,
    pascalCase,
    camelCase,
    titleCase,
    SwaggerDefinition,
    getTypeScriptType,
} from "@ng-openapi/shared";
import { ResourceAction, Resource } from "./admin.types";
import { plural } from "./admin.helpers";

function getMethodName(op: PathInfo): string {
    if (op.operationId) return camelCase(op.operationId);
    const pathForMethod = op.path.replace(/[\/{}]/g, '');
    return `${camelCase(pathForMethod)}${pascalCase(op.method)}`;
}

function findSchema(op: PathInfo | undefined, type: 'request' | 'response'): { ref: string | null; schema: SwaggerDefinition; contentType?: string; } | null {
    if (!op) return null;
    if (type === 'request') {
        const content = op.requestBody?.content;
        if (content) {
            const jsonSchema = content['application/json']?.schema;
            if (jsonSchema) return { ref: jsonSchema.$ref || null, schema: jsonSchema, contentType: 'application/json' };
            const multipartSchema = content['multipart/form-data']?.schema;
            if (multipartSchema) return { ref: multipartSchema.$ref || null, schema: multipartSchema, contentType: 'multipart/form-data' };
        }
    } else { // response
        const schema = op.responses?.['200']?.content?.['application/json']?.schema;
        if (schema) {
            if (schema.type === 'array' && schema.items) {
                return { ref: (schema.items as any).$ref || null, schema: schema.items as SwaggerDefinition };
            }
            return { ref: schema.$ref || null, schema };
        }
    }
    return null;
}

export function discoverAdminResources(parser: SwaggerParser): Resource[] {
    const paths = extractPaths(parser.getSpec().paths);
    const tagMap = new Map<string, PathInfo[]>();
    paths.forEach(p => p.tags?.forEach(t => {
        if (!tagMap.has(t)) tagMap.set(t, []);
        tagMap.get(t)!.push(p);
    }));

    const resources: Resource[] = [];
    for (const [tag, operations] of tagMap.entries()) {
        const usedOps = new Set<PathInfo>();

        const shortestPath = [...operations].sort((a, b) => a.path.length - b.path.length)[0]?.path;
        if (!shortestPath) continue;
        const resourcePath = shortestPath.split('/{')[0];

        const isCollectionPath = (p: PathInfo) => p.path === resourcePath;
        const isItemPath = (p: PathInfo) => p.path.startsWith(resourcePath + '/') && p.path.includes('{');

        const listOp = operations.find(p => p.method === 'GET' && isCollectionPath(p) && p.responses?.['200']?.content?.['application/json']?.schema?.type === 'array');
        if (listOp) usedOps.add(listOp);

        const createOp = operations.find(p => p.method === 'POST' && isCollectionPath(p) && findSchema(p, 'request'));
        if (createOp) usedOps.add(createOp);

        const readOp = operations.find(p => p.method === 'GET' && isItemPath(p));
        if (readOp) usedOps.add(readOp);

        const updateOp = operations.find(p => p.method === 'PUT' && isItemPath(p) && findSchema(p, 'request'));
        if (updateOp) usedOps.add(updateOp);

        const deleteOp = operations.find(p => p.method === 'DELETE' && isItemPath(p));
        if (deleteOp) usedOps.add(deleteOp);

        const getParamType = (op: PathInfo | undefined) => {
            const param = op?.parameters?.find(p => p.in === 'path');
            if (!param) return 'string';
            return getTypeScriptType(param.schema || param, parser.config) as 'string' | 'number';
        };

        const modelRef = findSchema(listOp, 'response')?.ref ?? findSchema(readOp, 'response')?.ref ?? findSchema(createOp, 'request')?.ref;
        if (!modelRef && !(listOp || createOp || readOp || updateOp || deleteOp || operations.some(op => op.summary))) continue;

        const modelName = modelRef ? pascalCase(modelRef.split('/').pop()!) : pascalCase(tag.replace(/s$/, ''));
        const createModelSchemaInfo = findSchema(createOp, 'request');
        const createModelName = createModelSchemaInfo?.ref ? pascalCase(createModelSchemaInfo.ref.split('/').pop()!) : modelName;

        const actions: ResourceAction[] = operations.filter(p => {
            if (usedOps.has(p)) return false;
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(p.method)) {
                return !!p.summary;
            }
            return false;
        }).map(p => {
            const pathParam = p.parameters?.find(param => param.in === 'path');
            const idParamType = pathParam ? (getTypeScriptType(pathParam.schema || pathParam, parser.config) as 'string' | 'number') : 'string';

            return {
                label: p.summary!,
                methodName: getMethodName(p),
                level: isItemPath(p) ? 'item' : 'collection',
                idParamName: pathParam?.name || 'id',
                idParamType: idParamType,
                parameters: p.parameters ?? []
            };
        });

        const singularTag = tag.replace(/s$/, '');

        const resource: Resource = {
            name: camelCase(singularTag),
            pluralName: plural(camelCase(singularTag)),
            titleName: titleCase(singularTag),
            modelName, createModelName,
            createModelRef: createModelSchemaInfo?.ref || '',
            serviceName: `${pascalCase(tag)}Service`,
            isEditable: !!(createOp || updateOp),
            operations: {
                list: listOp ? {
                    methodName: getMethodName(listOp), idParamName: '', idParamType: 'string', parameters: listOp.parameters ?? [],
                    hasPagination: !!listOp.parameters?.some(p => ['page', 'pageSize'].includes(p.name)),
                    hasSorting: !!listOp.parameters?.some(p => ['sort', 'order'].includes(p.name)),
                    filterParameters: listOp.parameters?.filter(p => p.in === 'query' && !['page', 'pageSize', 'sort', 'order'].includes(p.name.toLowerCase())).map(p => {
                        const schema = p.schema || p;
                        return { name: p.name, inputType: schema.enum ? 'select' : (schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'), enumValues: schema.enum };
                    })
                } : undefined,
                create: createOp ? { methodName: getMethodName(createOp), idParamName: '', idParamType: 'string', parameters: createOp.parameters ?? [] } : undefined,
                read: readOp ? { methodName: getMethodName(readOp), idParamName: readOp.parameters?.find(p => p.in === 'path')?.name || 'id', idParamType: getParamType(readOp), parameters: readOp.parameters ?? [] } : undefined,
                update: updateOp ? { methodName: getMethodName(updateOp), idParamName: updateOp.parameters?.find(p => p.in === 'path')?.name || 'id', idParamType: getParamType(updateOp), parameters: updateOp.parameters ?? [] } : undefined,
                delete: deleteOp ? { methodName: getMethodName(deleteOp), idParamName: deleteOp.parameters?.find(p => p.in === 'path')?.name || 'id', idParamType: getParamType(deleteOp), parameters: deleteOp.parameters ?? [] } : undefined,
            },
            actions, formProperties: [], listColumns: [],
        };

        let schemaForColumns = findSchema(listOp, 'response')?.schema ?? findSchema(readOp, 'response')?.schema;
        if (schemaForColumns) {
            const resolved = schemaForColumns.$ref ? parser.resolveReference(schemaForColumns.$ref) : schemaForColumns;
            if (resolved?.properties) {
                resource.listColumns = Object.keys(resolved.properties).filter(key => {
                    const prop = resolved.properties![key];
                    return !prop.$ref && (!prop.type || ['string', 'number', 'integer', 'boolean'].includes(prop.type as string));
                });
            }
        }
        resources.push(resource);
    }
    return resources;
}
