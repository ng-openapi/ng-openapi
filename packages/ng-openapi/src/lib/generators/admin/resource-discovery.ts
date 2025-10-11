import { SwaggerParser, extractPaths, PathInfo, pascalCase, camelCase, titleCase } from "@ng-openapi/shared";
import { ActionOperation, FilterParameter, Resource } from "./admin.types";
import { plural } from "./admin.helpers";

function getMethodName(operation: any): string {
    if (operation.operationId) return camelCase(operation.operationId);
    return `${camelCase(operation.path.replace(/[/{}]/g, ""))}${pascalCase(operation.method)}`;
}

export function discoverAdminResources(parser: SwaggerParser): Resource[] {
    const paths = extractPaths(parser.getSpec().paths);
    const tagGroups = new Map<string, PathInfo[]>();
    paths.forEach((p) => {
        const t = p.tags?.[0];
        if (t && !t.includes("_")) {
            if (!tagGroups.has(t)) tagGroups.set(t, []);
            tagGroups.get(t)!.push(p);
        }
    });

    const resources: Resource[] = [];
    for (const [tag, tagPaths] of tagGroups.entries()) {
        const isItemPath = (p: PathInfo) => /\{[^}]+\}$/.test(p.path);
        const initialPaths = [...tagPaths];
        const usedPaths = new Set<string>();

        const findAndMarkUsed = (predicate: (p: PathInfo) => boolean): PathInfo | undefined => {
            const found = initialPaths.find(p => !usedPaths.has(`${p.method}:${p.path}`) && predicate(p));
            if (found) { usedPaths.add(`${found.method}:${found.path}`); }
            return found;
        };

        const createOp = findAndMarkUsed(p => p.method === 'POST' && !isItemPath(p) && (p.requestBody?.content?.['application/json']?.schema?.$ref || (p.parameters || []).find(param => param.in === 'body')?.schema?.$ref));
        const listOp = findAndMarkUsed(p => p.method === 'GET' && !isItemPath(p) && p.responses?.['200']?.schema?.type === 'array');
        const readOp = findAndMarkUsed(p => p.method === 'GET' && isItemPath(p));
        const updateOp = findAndMarkUsed(p => (p.method === 'PUT' || p.method === 'PATCH') && isItemPath(p));
        const deleteOp = findAndMarkUsed(p => p.method === 'DELETE' && isItemPath(p));
        
        const remainingPaths = initialPaths.filter(p => !usedPaths.has(`${p.method}:${p.path}`));

        if (!listOp && !createOp && !readOp && remainingPaths.length === 0) {
            continue;
        }

        const actions: ActionOperation[] = remainingPaths.map(p => ({
            label: titleCase(p.summary || p.operationId || p.path.split('/').pop()!.replace(/\{|\}/g, '')),
            methodName: getMethodName(p),
            level: isItemPath(p) ? 'item' : 'collection',
            path: p.path,
            method: p.method.toUpperCase() as any,
        }));

        const bodyParam = (createOp?.parameters || []).find(p => p.in === 'body');
        const schemaObject = bodyParam?.schema || createOp?.requestBody?.content?.['application/json']?.schema;
        const ref = schemaObject?.$ref;

        const filterParameters: FilterParameter[] = [];
        if (listOp?.parameters) {
            listOp.parameters.filter(p => p.in === 'query').forEach((p) => {
                const schema = p.schema || p;
                if (schema.type === 'string' && schema.enum) {
                    filterParameters.push({ name: p.name, inputType: 'select', enumValues: schema.enum });
                } else if (schema.type === 'string') {
                    filterParameters.push({ name: p.name, inputType: 'text' });
                } else if (schema.type === 'number' || schema.type === 'integer') {
                    filterParameters.push({ name: p.name, inputType: 'number' });
                }
            });
        }
        
        const mainModelSchemaName = listOp?.responses?.['200']?.schema?.items?.$ref?.split('/')?.pop() || readOp?.responses?.['200']?.schema?.$ref?.split('/')?.pop();
        const refName = ref?.split('/').pop();
        const modelName = mainModelSchemaName || (refName?.startsWith('Create') ? refName.replace(/^Create/, '') : refName);
        
        const getIdParamName = (op: PathInfo | undefined) => op?.parameters?.find(p => p.in === 'path')?.name || 'id';
        const singularTag = tag.endsWith('s') && !tag.endsWith('ss') ? tag.slice(0, -1) : tag;
        
        const resource: Resource = {
            name: singularTag.toLowerCase(),
            className: pascalCase(singularTag),
            pluralName: plural(singularTag).toLowerCase(),
            titleName: titleCase(singularTag),
            serviceName: pascalCase(tag) + "Service",
            modelName: pascalCase(modelName || '') || '',
            createModelName: ref ? pascalCase(ref.split('/').pop()!) : '',
            createModelRef: ref,
            isEditable: !!(createOp || updateOp),
            operations: {
                list: listOp ? { methodName: getMethodName(listOp), filterParameters } : undefined,
                create: createOp ? { methodName: getMethodName(createOp), bodyParamName: bodyParam?.name } : undefined,
                read: readOp ? { methodName: getMethodName(readOp), idParamName: getIdParamName(readOp) } : undefined,
                update: updateOp ? { methodName: getMethodName(updateOp), idParamName: getIdParamName(updateOp), bodyParamName: (updateOp.parameters || []).find(p => p.in === 'body')?.name } : undefined,
                delete: deleteOp ? { methodName: getMethodName(deleteOp), idParamName: getIdParamName(deleteOp) } : undefined,
            },
            actions,
            formProperties: [],
            listColumns: [],
        };

        const modelRefForColumns = listOp?.responses?.['200']?.schema?.items?.$ref || readOp?.responses?.['200']?.schema?.$ref || ref;
        if (modelRefForColumns) {
            const schemaForColumns = parser.resolveReference(modelRefForColumns);
            if (schemaForColumns && schemaForColumns.properties) {
                resource.listColumns = Object.keys(schemaForColumns.properties).filter(key => {
                    const propSchema = schemaForColumns.properties[key];
                    if (key === 'id' && propSchema.type) return true;
                    return propSchema.type !== 'object' && propSchema.type !== 'array' && !propSchema.$ref;
                });
            }
        }
        resources.push(resource);
    }
    console.log(`[ADMIN] Pass 1 Complete: Identified ${resources.length} potential scaffolding targets.`);
    return resources;
}