import type { Project } from "ts-morph";
import type { NormalizedSpec } from "../model/spec.model";
import type { GeneratorConfig } from "./config.types";

/**
 * Everything a plugin generator receives from the orchestrator.
 *
 * Plugins get the same narrow inputs as the core generators: the version-free
 * NormalizedSpec (never the raw spec or the parser) and the shared ts-morph
 * Project they must emit through so the orchestrator can track written files.
 */
export interface PluginGeneratorContext {
    /** Version-free spec model; $refs resolved, per-operation fields precomputed. */
    spec: NormalizedSpec;
    /** Shared ts-morph project all generators emit through. */
    project: Project;
    /** Full user-facing config; plugins should read only the slice they need. */
    config: GeneratorConfig;
    /** Sink for non-fatal diagnostics — plugins must never log directly. */
    onWarning?: (message: string) => void;
}

/**
 * Constructor contract for plugin generator classes (what GeneratorConfig.plugins accepts).
 */
export interface IPluginGeneratorClass {
    new (context: PluginGeneratorContext): IPluginGenerator;
}

/**
 * Interface for generator instances
 */
export interface IPluginGenerator {
    /**
     * Generate code files under the given output root.
     */
    generate(outputRoot: string): Promise<void>;
}
