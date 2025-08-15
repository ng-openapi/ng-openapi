import { Project } from "ts-morph";
import { GeneratorConfig } from "./config.types";
import { SwaggerParser } from "../core";

/**
 * Interface for generator instances
 */
export interface IPluginGenerator {
    /**
     * Generate code files
     */
    generate(outputRoot: string): void;
}

/**
 * Interface for generator constructor with static methods
 */
export interface IPluginGeneratorConstructor {
    /**
     * Create a generator instance
     */
    create(swaggerPathOrUrl: string, project: Project, config: GeneratorConfig): Promise<IPluginGenerator>;

    /**
     * Constructor signature
     */
    new (parser: SwaggerParser, project: Project, config: GeneratorConfig): IPluginGenerator;
}

/**
 * Combined type that includes both static and instance methods
 */
export type IPluginGeneratorClass = IPluginGeneratorConstructor & {
    prototype: IPluginGenerator;
}