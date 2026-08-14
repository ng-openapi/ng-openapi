import type { NormalizedOperation } from "../../model/operation.model";
import { pascalCase } from "../string.utils";

/**
 * Groups operations into the per-controller buckets each client generator
 * emits one file from: the first tag when there is one, otherwise the second
 * path segment, otherwise "Default".
 *
 * Shared because the core service generator, the httpResource plugin and the
 * zod plugin must agree on the grouping — a controller name decides a class
 * name AND a file name, and the barrel generators re-derive the class name
 * from the file name.
 *
 * `onWarning` fires when two distinct tags normalize onto one controller
 * ("Groups (yes)" and "Groups-yes" both become "GroupsYes"). They are merged
 * into a single file rather than dropped, but silently merging two documented
 * tags is worth saying out loud.
 */
export function groupOperationsByController(
    operations: NormalizedOperation[],
    onWarning?: (message: string) => void,
): Record<string, NormalizedOperation[]> {
    const groups: Record<string, NormalizedOperation[]> = {};
    const sourceNames = new Map<string, string>();

    operations.forEach((operation) => {
        let rawName = "Default";

        if (operation.tags && operation.tags.length > 0) {
            rawName = operation.tags[0];
        } else {
            // Extract from path (e.g., "/api/users/{id}" -> "Users")
            const pathParts = operation.path.split("/").filter((part) => part && !part.startsWith("{"));
            if (pathParts.length > 1) {
                rawName = pathParts[1];
            }
        }

        const controllerName = pascalCase(rawName);

        const firstSource = sourceNames.get(controllerName);
        if (firstSource === undefined) {
            sourceNames.set(controllerName, rawName);
        } else if (firstSource !== rawName) {
            onWarning?.(
                `Tags "${firstSource}" and "${rawName}" both map to the controller "${controllerName}" — ` +
                    `their operations are generated into one file. Rename one tag to keep them apart.`,
            );
            // Recorded so a third distinct spelling warns against the first too
            sourceNames.set(controllerName, firstSource);
        }

        if (!groups[controllerName]) {
            groups[controllerName] = [];
        }
        groups[controllerName].push(operation);
    });

    return groups;
}
