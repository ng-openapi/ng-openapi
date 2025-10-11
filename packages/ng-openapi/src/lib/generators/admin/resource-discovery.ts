// packages/ng-openapi/src/lib/generators/admin/resource-discovery.ts

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
        const isItemPath = (p: PathInfo) => /\{[^}]+\}/.test(p.path);
        const getResponseSchema = (p: PathInfo | undefined) => p?.responses?.['200']?.content?.['application/json']?.schema;

        let listOp: PathInfo | undefined, createOp: PathInfo | undefined, readOp: PathInfo | undefined, updateOp: PathInfo | undefined, deleteOp: PathInfo | undefined;
        const usedPaths = new Set<string>();

        // <<< THE FINAL FIX IS HERE >>>
        // Loosen the listOp definition to be any GET on a non-item path. This is the key.
        listOp = tagPaths.find(p => p.method === 'GET' && !isItemPath(p));
        if(listOp) usedPaths.add(`${listOp.method}:${listOp.path}`);

        createOp = tagPaths.find(p => p.method === 'POST' && !isItemPath(p) && p.requestBody?.content?.['application/json']?.schema?.$ref);
        if(createOp) usedPaths.add(`${createOp.method}:${createOp.path}`);

        // Make readOp more specific to avoid matching action paths like /items/{id}/action
        readOp = tagPaths.find(p => p.method === 'GET' && isItemPath(p) && p.path.endsWith('}'));
        if(readOp) usedPaths.add(`${readOp.method}:${readOp.path}`);

        updateOp = tagPaths.find(p => (p.method === 'PUT' || p.method === 'PATCH') && isItemPath(p));
        if(updateOp) usedPaths.add(`${updateOp.method}:${updateOp.path}`);

        deleteOp = tagPaths.find(p => p.method === 'DELETE' && isItemPath(p));
        if(deleteOp) usedPaths.add(`${deleteOp.method}:${deleteOp.path}`);

        if (!listOp && !createOp && !readOp && tagPaths.every(p => usedPaths.has(`${p.method}:${p.path}`))) {
            continue;
        }

        // Actions are ONLY what's left over
        const actions: ActionOperation[] = tagPaths
            .filter(p => !usedPaths.has(`${p.method}:${p.path}`))
            .map(p => ({
                label: titleCase(p.summary || p.operationId || p.path.split('/').pop()!.replace(/\{|\}/g, '')),
                methodName: getMethodName(p),
                level: isItemPath(p) ? 'item' : 'collection',
                path: p.path,
                method: p.method.toUpperCase() as any,
            }));

        const schemaObject = createOp?.requestBody?.content?.['application/json']?.schema;
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

        const mainModelSchemaName = getResponseSchema(listOp)?.items?.$ref?.split('/')?.pop() || getResponseSchema(readOp)?.$ref?.split('/')?.pop();
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
                create: createOp ? { methodName: getMethodName(createOp) } : undefined,
                read: readOp ? { methodName: getMethodName(readOp), idParamName: getIdParamName(readOp) } : undefined,
                update: updateOp ? { methodName: getMethodName(updateOp), idParamName: getIdParamName(updateOp) } : undefined,
                delete: deleteOp ? { methodName: getMethodName(deleteOp), idParamName: getIdParamName(deleteOp) } : undefined,
            },
            actions,
            formProperties: [],
            listColumns: [],
        };

        const modelRefForColumns = getResponseSchema(listOp)?.items?.$ref || getResponseSchema(readOp)?.$ref || ref;
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
