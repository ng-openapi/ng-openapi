import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { listGeneratedFileNames } from "../src";

const createProject = () => new Project({ useInMemoryFileSystem: true });

describe("listGeneratedFileNames", () => {
    it("returns [] for a directory the project never wrote to", () => {
        const project = createProject();
        expect(listGeneratedFileNames(project, "/out/services", ".service.ts")).toEqual([]);
    });

    it("lists only files matching the suffix, with the suffix stripped", () => {
        const project = createProject();
        project.createSourceFile("/out/services/orders.service.ts", "");
        project.createSourceFile("/out/services/auth.service.ts", "");
        project.createSourceFile("/out/services/index.ts", "");

        expect(listGeneratedFileNames(project, "/out/services", ".service.ts")).toEqual(["auth", "orders"]);
    });

    it("sorts the result for deterministic output", () => {
        const project = createProject();
        project.createSourceFile("/out/validators/zebra.validator.ts", "");
        project.createSourceFile("/out/validators/alpha.validator.ts", "");
        project.createSourceFile("/out/validators/middle.validator.ts", "");

        expect(listGeneratedFileNames(project, "/out/validators", ".validator.ts")).toEqual([
            "alpha",
            "middle",
            "zebra",
        ]);
    });

    it("does not descend into subdirectories", () => {
        const project = createProject();
        project.createSourceFile("/out/services/orders.service.ts", "");
        project.createSourceFile("/out/services/nested/hidden.service.ts", "");

        expect(listGeneratedFileNames(project, "/out/services", ".service.ts")).toEqual(["orders"]);
    });

    it("does not list files removed from the project", () => {
        const project = createProject();
        const kept = project.createSourceFile("/out/services/kept.service.ts", "");
        const removed = project.createSourceFile("/out/services/removed.service.ts", "");
        project.removeSourceFile(removed);

        expect(kept.wasForgotten()).toBe(false);
        expect(listGeneratedFileNames(project, "/out/services", ".service.ts")).toEqual(["kept"]);
    });
});
