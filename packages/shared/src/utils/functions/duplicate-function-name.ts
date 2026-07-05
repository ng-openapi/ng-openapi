import { FunctionDeclaration, MethodDeclaration } from "ts-morph";

/** Whether two or more declarations share a name — generation aborts on colliding method names. */
export function hasDuplicateFunctionNames<T extends MethodDeclaration | FunctionDeclaration>(arr: T[]): boolean {
    return new Set(arr.map((fn) => fn.getName())).size !== arr.length;
}
