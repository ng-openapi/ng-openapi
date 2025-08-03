import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { SwaggerDefinition, SwaggerSpec } from "../types";

export class SwaggerParser {
    private readonly spec: SwaggerSpec;

    constructor(swaggerPath: string) {
        const swaggerContent = fs.readFileSync(swaggerPath, "utf8");
        this.spec = this.parseSpecFile(swaggerContent, swaggerPath);
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
        const parts = ref.split("/");
        const definitionName = parts[parts.length - 1];
        return this.getDefinition(definitionName);
    }

    getAllDefinitionNames(): string[] {
        return Object.keys(this.getDefinitions());
    }

    getSpec(): SwaggerSpec {
        return this.spec;
    }

    getPaths(): Record<string, any> {
        return this.spec.paths || {};
    }

    isValidSpec(): boolean {
        return !!(
            (this.spec.swagger && this.spec.swagger.startsWith("2.")) ||
            (this.spec.openapi && this.spec.openapi.startsWith("3."))
        );
    }

    getSpecVersion(): { type: "swagger" | "openapi"; version: string } | null {
        if (this.spec.swagger) {
            return { type: "swagger", version: this.spec.swagger };
        }
        if (this.spec.openapi) {
            return { type: "openapi", version: this.spec.openapi };
        }
        return null;
    }

    private parseSpecFile(content: string, filePath: string): SwaggerSpec {
        const extension = path.extname(filePath).toLowerCase();

        switch (extension) {
            case ".json":
                return JSON.parse(content);

            case ".yaml":
            case ".yml":
                return yaml.load(content) as SwaggerSpec;

            default:
                throw new Error(
                    `Failed to parse ${
                        extension || "specification"
                    } file: ${filePath}. Supported formats are .json, .yaml, and .yml.`
                );
        }
    }
}
