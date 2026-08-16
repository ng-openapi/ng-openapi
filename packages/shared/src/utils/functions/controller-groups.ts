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
 * `onWarning` fires when two distinct *tags* normalize onto one controller
 * ("Groups (yes)" and "Groups-yes" both become "GroupsYes"). They are merged
 * into a single file rather than dropped, but silently merging two documented
 * tags is worth saying out loud. Path-derived names are excluded: a tagged
 * `Users` operation next to an untagged `/users/...` one is the ordinary
 * partially-tagged spec, and merging them is the intended behaviour.
 */
export function groupOperationsByController(
    operations: NormalizedOperation[],
    onWarning?: (message: string) => void,
): Record<string, NormalizedOperation[]> {
    const groups: Record<string, NormalizedOperation[]> = {};
    const tagSpellings = new Map<string, Set<string>>();

    operations.forEach((operation) => {
        const tag = operation.tags?.[0];
        let rawName = "Default";

        if (tag !== undefined) {
            rawName = tag;
        } else {
            // Extract from path (e.g., "/api/users/{id}" -> "Users")
            const pathParts = operation.path.split("/").filter((part) => part && !part.startsWith("{"));
            if (pathParts.length > 1) {
                rawName = pathParts[1];
            }
        }

        // pascalCase("") is "" and an empty tag is legal in a spec; without
        // this the controller would emit the dotfile `.service.ts`, which `ls`
        // hides and most ignore globs skip.
        const controllerName = pascalCase(rawName) || "Default";

        if (tag !== undefined) {
            const spellings = tagSpellings.get(controllerName) ?? new Set<string>();
            spellings.add(tag);
            tagSpellings.set(controllerName, spellings);
        }

        if (!groups[controllerName]) {
            groups[controllerName] = [];
        }
        groups[controllerName].push(operation);
    });

    for (const [controllerName, spellings] of tagSpellings) {
        if (spellings.size > 1) {
            onWarning?.(
                `Tags ${[...spellings].map((name) => `"${name}"`).join(" and ")} all map to the controller ` +
                    `"${controllerName}" — their operations are generated into one file. ` +
                    `Rename one tag to keep them apart.`,
            );
        }
    }

    return groups;
}
