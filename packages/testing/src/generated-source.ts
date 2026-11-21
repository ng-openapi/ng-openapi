import { expect } from "vitest";

/**
 * The implementation of one generated class method: from its last signature
 * (the one after the overloads) to its closing brace. Fails the test when the
 * class has no such method, so an assertion on the result is never vacuous.
 */
export function methodSource(classSource: string, name: string): string {
    const start = classSource.lastIndexOf(`    ${name}(`);
    expect(start, `method ${name} was not generated`).toBeGreaterThan(-1);
    return classSource.slice(start, classSource.indexOf("\n    }\n", start));
}
