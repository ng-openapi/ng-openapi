import type { NameDecoration } from "../../types/config.types";
import { pascalCase, pascalCaseForEnums } from "../string.utils";

/**
 * Single source of truth for generated identifier construction. The class
 * names below are re-derived independently by the emitting generators AND
 * the barrel index generators (which reconstruct them from file names), so
 * every caller must go through these helpers — hand-rolling the convention
 * at a call site desynchronizes the barrels from the emitted classes.
 */

function decorate(base: string, defaultSuffix: string, naming?: NameDecoration): string {
    return `${naming?.prefix ?? ""}${base}${naming?.suffix ?? defaultSuffix}`;
}

/** Class name of a generated service ("Role" → "RoleService", or decorated). */
export function getServiceClassName(controllerName: string, naming?: NameDecoration): string {
    return decorate(pascalCase(controllerName), "Service", naming);
}

/** Class name of a generated httpResource class ("Role" → "RoleResource", or decorated). */
export function getResourceClassName(controllerName: string, naming?: NameDecoration): string {
    return decorate(pascalCase(controllerName), "Resource", naming);
}

/**
 * TypeScript identifier of a schema-derived model type. Used both where
 * models are declared (models/index.ts) and where they are referenced
 * (service/resource signatures) — ts-morph's fixMissingImports matches the
 * two by exact name, so they must never diverge.
 */
export function getModelTypeName(rawName: string, naming?: NameDecoration): string {
    return decorate(pascalCaseForEnums(rawName), "", naming);
}
