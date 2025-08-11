import { FunctionDeclaration, MethodDeclaration } from "ts-morph";

export function hasDuplicateFunctionNames<T extends (MethodDeclaration | FunctionDeclaration)>(arr: T[]): boolean {
    return new Set(arr.map((fn) => fn.getName())).size !== arr.length;
}