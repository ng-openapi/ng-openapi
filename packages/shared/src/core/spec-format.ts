import * as path from "path";
import * as yaml from "js-yaml";
import { isUrl } from "../utils/functions/is-url";
import { SpecParseError } from "../errors";
import type { SwaggerSpec } from "../types/swagger.types";

/**
 * Format detection and parsing of raw spec content.
 * Pure functions — no I/O; loading lives in spec-loader.ts.
 */

export function parseSpecContent(content: string, pathOrUrl: string): SwaggerSpec {
    // Determine format from URL or file extension
    let format: "json" | "yaml" | "yml";

    if (isUrl(pathOrUrl)) {
        // For URLs, try to determine format from URL path or content
        const urlPath = new URL(pathOrUrl).pathname.toLowerCase();
        if (urlPath.endsWith(".json")) {
            format = "json";
        } else if (urlPath.endsWith(".yaml") || urlPath.endsWith(".yml")) {
            format = "yaml";
        } else {
            // Auto-detect from content
            format = detectFormat(content);
        }
    } else {
        // For files, use extension
        const extension = path.extname(pathOrUrl).toLowerCase();
        switch (extension) {
            case ".json":
                format = "json";
                break;
            case ".yaml":
                format = "yaml";
                break;
            case ".yml":
                format = "yml";
                break;
            default:
                format = detectFormat(content);
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
        throw new SpecParseError(
            `Failed to parse ${format.toUpperCase()} content from: ${pathOrUrl}. Error: ${
                error instanceof Error ? error.message : error
            }`,
            pathOrUrl,
            error,
        );
    }
}

export function detectFormat(content: string): "json" | "yaml" {
    const trimmed = content.trim();

    // Check if it starts with JSON indicators
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return "json";
    }

    // Check for YAML indicators
    if (
        trimmed.includes("openapi:") ||
        trimmed.includes("swagger:") ||
        trimmed.includes("---") ||
        /^[a-zA-Z][a-zA-Z0-9_]*\s*:/.test(trimmed)
    ) {
        return "yaml";
    }

    // Default to JSON and let JSON.parse handle the error
    return "json";
}
