// Import the concrete type modules, not the ../types barrel: the barrel pulls in
// plugin.types.ts, which needs this file — going through it re-creates the cycle.
import type { GeneratorConfig } from "../types/config.types";
import type { SwaggerDefinition, SwaggerSpec } from "../types/swagger.types";
import type { NormalizedSpec } from "../model/spec.model";
import { loadSpecContent } from "./spec-loader";
import { parseSpecContent } from "./spec-format";
import { normalizeSpec } from "./normalize";
import { SpecParseError } from "../errors";

/**
 * Typed access to a parsed OpenAPI/Swagger spec.
 * Loading (fs/http) lives in spec-loader.ts; format detection and parsing in
 * spec-format.ts — this class is a façade over both plus spec accessors.
 */
export class SwaggerParser {
    private readonly spec: SwaggerSpec;
    private normalized?: NormalizedSpec;

    private constructor(spec: SwaggerSpec, config: GeneratorConfig) {
        const isInputValid = config.validateInput?.(spec) ?? true;
        if (!isInputValid) {
            throw new SpecParseError("Swagger spec is not valid. Check your `validateInput` condition.");
        }
        this.spec = spec;
    }

    /**
     * Loads, parses and wraps a spec.
     *
     * @throws SpecLoadError when the file/URL cannot be read.
     * @throws SpecParseError when the content cannot be parsed or the
     *   config's `validateInput` hook rejects the spec.
     */
    static async create(swaggerPathOrUrl: string, config: GeneratorConfig): Promise<SwaggerParser> {
        const swaggerContent = await loadSpecContent(swaggerPathOrUrl);
        const spec = parseSpecContent(swaggerContent, swaggerPathOrUrl);
        return new SwaggerParser(spec, config);
    }

    /**
     * The version-free model generators consume. Computed once and cached —
     * all generators share the same NormalizedOperation instances, so they
     * can be used as Map keys across generators.
     */
    getNormalizedSpec(): NormalizedSpec {
        this.normalized ??= normalizeSpec(this.spec);
        return this.normalized;
    }

    /** Definition map regardless of version: 2.0 `definitions` or 3.x `components.schemas`. */
    getDefinitions(): Record<string, SwaggerDefinition> {
        return this.spec.definitions || this.spec.components?.schemas || {};
    }

    /** One definition by bare name, or undefined when the spec has none by that name. */
    getDefinition(name: string): SwaggerDefinition | undefined {
        const definitions = this.getDefinitions();
        return definitions[name];
    }

    /** Resolves "#/definitions/X" / "#/components/schemas/X" style refs by their last segment. */
    resolveReference(ref: string): SwaggerDefinition | undefined {
        const parts = ref.split("/");
        const definitionName = parts[parts.length - 1];
        return this.getDefinition(definitionName);
    }

    getAllDefinitionNames(): string[] {
        return Object.keys(this.getDefinitions());
    }

    /** The raw parsed spec — prefer getNormalizedSpec() unless raw access is the point. */
    getSpec(): SwaggerSpec {
        return this.spec;
    }

    getPaths(): SwaggerSpec["paths"] {
        return this.spec.paths || {};
    }

    /** Whether the spec declares a supported version (Swagger 2.x or OpenAPI 3.x). */
    isValidSpec(): boolean {
        return !!(
            (this.spec.swagger && this.spec.swagger.startsWith("2.")) ||
            (this.spec.openapi && this.spec.openapi.startsWith("3."))
        );
    }

    /** Detected flavor + literal version string, or null when neither field is present. */
    getSpecVersion(): { type: "swagger" | "openapi"; version: string } | null {
        if (this.spec.swagger) {
            return { type: "swagger", version: this.spec.swagger };
        }
        if (this.spec.openapi) {
            return { type: "openapi", version: this.spec.openapi };
        }
        return null;
    }
}
