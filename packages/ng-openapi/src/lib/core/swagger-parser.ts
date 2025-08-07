import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { SwaggerDefinition, SwaggerSpec } from "../types";

export class SwaggerParser {
    private readonly spec: SwaggerSpec;

    private constructor(spec: SwaggerSpec) {
        this.spec = spec;
    }

    static async create(swaggerPathOrUrl: string): Promise<SwaggerParser> {
        const swaggerContent = await SwaggerParser.loadContent(swaggerPathOrUrl);
        const spec = SwaggerParser.parseSpecContent(swaggerContent, swaggerPathOrUrl);
        return new SwaggerParser(spec);
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

    private static async loadContent(pathOrUrl: string): Promise<string> {
        if (SwaggerParser.isUrl(pathOrUrl)) {
            return await SwaggerParser.fetchUrlContent(pathOrUrl);
        } else {
            return fs.readFileSync(pathOrUrl, "utf8");
        }
    }

    private static isUrl(input: string): boolean {
        try {
            new URL(input);
            return true;
        } catch {
            return false;
        }
    }

    private static async fetchUrlContent(url: string): Promise<string> {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json, application/yaml, text/yaml, text/plain, */*',
                    'User-Agent': 'ng-openapi'
                },
                // 30 second timeout
                signal: AbortSignal.timeout(30000)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const content = await response.text();

            if (!content || content.trim() === '') {
                throw new Error(`Empty response from URL: ${url}`);
            }

            return content;
        } catch (error: any) {
            // Provide helpful error message
            let errorMessage = `Failed to fetch content from URL: ${url}`;

            if (error.name === 'AbortError') {
                errorMessage += ' - Request timeout (30s)';
            } else if (error.message) {
                errorMessage += ` - ${error.message}`;
            }

            throw new Error(errorMessage);
        }
    }

    private static parseSpecContent(content: string, pathOrUrl: string): SwaggerSpec {
        // Determine format from URL or file extension
        let format: 'json' | 'yaml' | 'yml';

        if (SwaggerParser.isUrl(pathOrUrl)) {
            // For URLs, try to determine format from URL path or content
            const urlPath = new URL(pathOrUrl).pathname.toLowerCase();
            if (urlPath.endsWith('.json')) {
                format = 'json';
            } else if (urlPath.endsWith('.yaml') || urlPath.endsWith('.yml')) {
                format = 'yaml';
            } else {
                // Auto-detect from content
                format = SwaggerParser.detectFormat(content);
            }
        } else {
            // For files, use extension
            const extension = path.extname(pathOrUrl).toLowerCase();
            switch (extension) {
                case ".json":
                    format = 'json';
                    break;
                case ".yaml":
                    format = 'yaml';
                    break;
                case ".yml":
                    format = 'yml';
                    break;
                default:
                    format = SwaggerParser.detectFormat(content);
            }
        }

        try {
            switch (format) {
                case "json":
                    return JSON.parse(content);
                case "yaml":
                case "yml":
                    return yaml.load(content) as SwaggerSpec;
                default:
                    throw new Error(`Unable to determine format for: ${pathOrUrl}`);
            }
        } catch (error) {
            throw new Error(
              `Failed to parse ${format.toUpperCase()} content from: ${pathOrUrl}. Error: ${
                error instanceof Error ? error.message : error
              }`
            );
        }
    }

    private static detectFormat(content: string): 'json' | 'yaml' {
        const trimmed = content.trim();

        // Check if it starts with JSON indicators
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            return 'json';
        }

        // Check for YAML indicators
        if (trimmed.includes('openapi:') || trimmed.includes('swagger:') ||
          trimmed.includes('---') || /^[a-zA-Z][a-zA-Z0-9_]*\s*:/.test(trimmed)) {
            return 'yaml';
        }

        // Default to JSON and let JSON.parse handle the error
        return 'json';
    }
}