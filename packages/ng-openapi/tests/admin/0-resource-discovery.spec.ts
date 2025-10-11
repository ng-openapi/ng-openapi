import { GeneratorConfig, SwaggerParser } from '@ng-openapi/shared';
import { discoverAdminResources } from '../../src/lib/generators/admin/resource-discovery';
import { fullE2ESpec } from './specs/test.specs';

describe('Unit: discoverAdminResources', () => {
    const createParser = (specString: string) => {
        const config = { options: { admin: {} } } as GeneratorConfig;
        // The parser needs a JavaScript object, not a JSON string.
        return new SwaggerParser(JSON.parse(specString), config);
    };

    it('should identify a resource as read-only if it only has GET operations', () => {
        const resources = discoverAdminResources(createParser(fullE2ESpec));
        const logResource = resources.find(r => r.name === 'log');
        expect(logResource).toBeDefined();
        expect(logResource!.isEditable).toBe(false);
    });

    it('should identify a resource as editable if it has a POST/PUT operation', () => {
        const resources = discoverAdminResources(createParser(fullE2ESpec));
        const bookResource = resources.find(r => r.name === 'book');
        expect(bookResource).toBeDefined();
        expect(bookResource!.isEditable).toBe(true);
    });

    it('should correctly categorize collection-level and item-level actions', () => {
        const resources = discoverAdminResources(createParser(fullE2ESpec));
        const serverResource = resources.find(r => r.name === 'server');
        expect(serverResource).toBeDefined();

        const collectionAction = serverResource!.actions.find(a => a.level === 'collection');
        const itemAction = serverResource!.actions.find(a => a.level === 'item');

        expect(collectionAction).toBeDefined();
        expect(itemAction).toBeDefined();
        expect(collectionAction?.label).toBe('Reindex SERVERS');
        expect(itemAction?.label).toBe('Reboot Server');
    });

    it('should create a resource shell for create-only resources', () => {
        const resources = discoverAdminResources(createParser(fullE2ESpec));
        const publisherResource = resources.find(r => r.name === 'publisher');
        expect(publisherResource).toBeDefined();
        expect(publisherResource!.operations.list).toBeUndefined();
        expect(publisherResource!.operations.create).toBeDefined();
    });
});
