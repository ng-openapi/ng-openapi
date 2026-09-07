import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { assertDistinctMemberNames, DuplicateGeneratedNameError } from "../src";
import type { NormalizedOperation } from "../src";

/**
 * The generators cannot reach the property half through a spec: derived
 * names are prefixed and hook results rejected before a method can land on a
 * property. Tested directly so the branch is watched at all.
 */
const classWith = (source: string) =>
    new Project({ useInMemoryFileSystem: true }).createSourceFile("x.ts", source).getClassOrThrow("C");
const op = (operationId: string): NormalizedOperation =>
    ({
        operationId,
        method: "GET",
        path: "/" + operationId,
        parameters: [],
        responses: {},
        tags: [],
    }) as unknown as NormalizedOperation;

describe("assertDistinctMemberNames", () => {
    it("passes distinct methods that do not shadow a property", () => {
        const cls = classWith("class C { private basePath = ''; a() {} b() {} }");
        expect(() =>
            assertDistinctMemberNames(cls, "C", [op("a"), op("b")], (o) => o.operationId as string),
        ).not.toThrow();
    });

    it("throws when two methods share a name", () => {
        const cls = classWith("class C { a() {} a() {} }");
        expect(() => assertDistinctMemberNames(cls, "C", [op("a"), op("a")], () => "a")).toThrow(
            DuplicateGeneratedNameError,
        );
    });

    it("throws when a method lands on a property the class binds", () => {
        const cls = classWith("class C { private basePath = ''; basePath() {} }");
        const error = (() => {
            try {
                assertDistinctMemberNames(cls, "C", [op("basePath")], () => "basePath");
            } catch (e) {
                return e as Error;
            }
            return undefined;
        })();
        expect(error).toBeInstanceOf(DuplicateGeneratedNameError);
        expect(error?.message).toMatch(/"basePath" from basePath .* \(a property of C\)/);
    });
});
