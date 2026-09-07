import { FunctionDeclaration, MethodDeclaration } from "ts-morph";

/**
 * Whether two or more declarations share a name.
 *
 * @deprecated The generators use `assertDistinctMemberNames`, which also
 * catches a method landing on a property and reports the colliding operations.
 * Kept because it was a public export; it will be removed in the next major.
 */
export function hasDuplicateFunctionNames<T extends MethodDeclaration | FunctionDeclaration>(arr: T[]): boolean {
    return new Set(arr.map((fn) => fn.getName())).size !== arr.length;
}
