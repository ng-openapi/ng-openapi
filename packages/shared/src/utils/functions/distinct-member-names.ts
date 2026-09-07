import { describeOperation, DuplicateGeneratedNameError } from "../../errors";
import type { NormalizedOperation } from "../../model/operation.model";

/** What the assertion reads off a class: ts-morph's ClassDeclaration satisfies it structurally. */
export interface ClassMembers {
    getMethods(): readonly { getName(): string }[];
    getProperties(): readonly { getName(): string }[];
}

/**
 * Throws when two operations produced the same method name, or a method name
 * landed on a property the class binds itself. One implementation for the
 * service and resource generators — the two copies had already begun to
 * drift, and the property check was missing from both.
 */
export function assertDistinctMemberNames(
    serviceClass: ClassMembers,
    className: string,
    operations: NormalizedOperation[],
    methodNameOf: (operation: NormalizedOperation) => string,
): void {
    const methodNames = serviceClass.getMethods().map((method) => method.getName());
    const propertyNames = new Set(serviceClass.getProperties().map((property) => property.getName()));
    const duplicates = [
        ...new Set(methodNames.filter((name, index) => methodNames.indexOf(name) !== index || propertyNames.has(name))),
    ];
    if (duplicates.length === 0) {
        return;
    }

    // Names the operations, not just the class: the operationId is what the
    // user has to change.
    const byName = new Map(duplicates.map((name) => [name, [] as NormalizedOperation[]]));
    for (const operation of operations) {
        byName.get(methodNameOf(operation))?.push(operation);
    }
    const detail = [...byName]
        .map(([name, ops]) => {
            const from = ops.map(describeOperation).join(" and ");
            return propertyNames.has(name)
                ? `"${name}" from ${from} (a property of ${className})`
                : `"${name}" from ${from}`;
        })
        .join("; ");

    throw new DuplicateGeneratedNameError(
        `Operations map to the same member name in ${className}: ${detail}. Ensure each operationId maps to a unique name.`,
        duplicates,
        [...byName.values()].flat(),
    );
}
