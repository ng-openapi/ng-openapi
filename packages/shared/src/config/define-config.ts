import type { GeneratorConfig } from "../types/config.types";

/**
 * Identity helper for config files: full type inference and IDE autocomplete
 * without a manual type annotation.
 *
 * @example
 * ```typescript
 * // openapi.config.ts
 * import { defineConfig } from "ng-openapi";
 *
 * export default defineConfig({
 *     input: "./swagger.json",
 *     output: "./src/api",
 *     options: { dateType: "Date", enumStyle: "enum" },
 * });
 * ```
 *
 * Purely compile-time sugar — runtime validation still happens in
 * validateGeneratorConfig at the generation boundary.
 */
export function defineConfig(config: GeneratorConfig): GeneratorConfig {
    return config;
}
