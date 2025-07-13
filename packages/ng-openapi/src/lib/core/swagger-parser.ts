import * as fs from 'fs';
import {SwaggerDefinition, SwaggerSpec} from '../types';

export class SwaggerParser {
    private spec: SwaggerSpec;

    constructor(swaggerPath: string) {
        const swaggerContent = fs.readFileSync(swaggerPath, 'utf8');
        this.spec = JSON.parse(swaggerContent);
    }

    getDefinitions(): Record<string, SwaggerDefinition> {
        // Support both Swagger 2.0 (definitions) and OpenAPI 3.0 (components.schemas)
        return this.spec.definitions || this.spec.components?.schemas || {};
    }

    getDefinition(name: string): SwaggerDefinition | undefined {
        const definitions = this.getDefinitions();
        return definitions[name];
    }

    resolveReference(ref: string): SwaggerDefinition | undefined {
        // Handle $ref like "#/definitions/User" or "#/components/schemas/User"
        const parts = ref.split('/');
        const definitionName = parts[parts.length - 1];
        return this.getDefinition(definitionName);
    }

    getAllDefinitionNames(): string[] {
        return Object.keys(this.getDefinitions());
    }
}