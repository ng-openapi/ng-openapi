// Type-only import from the concrete module (not the ../core barrel): a value
// import through the barrel creates the cycle core -> types -> core.
import type { SwaggerParser } from "../core/swagger-parser";
import type { Project } from "ts-morph";
import type { GeneratorConfig } from "./config.types";

/**
 * Interface for generator class (both constructor and instance)
 */
export interface IPluginGeneratorClass {
    /**
     * Constructor signature
     */
    new (parser: SwaggerParser, project: Project, config: GeneratorConfig): IPluginGenerator;
}

/**
 * Interface for generator instances
 */
export interface IPluginGenerator {
    /**
     * Generate code files
     */
    generate(outputRoot: string): Promise<void>;
}
