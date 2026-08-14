import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { listGeneratedBarrelDirs, listGeneratedFileNames } from "../src";

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

describe("listGeneratedBarrelDirs", () => {
    it("returns [] for a root the project never wrote to", () => {
        const project = createProject();
        expect(listGeneratedBarrelDirs(project, "/out")).toEqual([]);
    });

    it("lists only direct child directories that have an index.ts", () => {
        const project = createProject();
        project.createSourceFile("/out/index.ts", "");
        project.createSourceFile("/out/resources/index.ts", "");
        project.createSourceFile("/out/resources/users.resource.ts", "");
        project.createSourceFile("/out/utils/date-transformer.ts", "");

        expect(listGeneratedBarrelDirs(project, "/out")).toEqual(["resources"]);
    });

    it("does not surface index.ts files nested deeper than one level", () => {
        const project = createProject();
        project.createSourceFile("/out/models/nested/index.ts", "");

        expect(listGeneratedBarrelDirs(project, "/out")).toEqual([]);
    });

    it("sorts the result for deterministic output", () => {
        const project = createProject();
        project.createSourceFile("/out/validators/index.ts", "");
        project.createSourceFile("/out/resources/index.ts", "");
        project.createSourceFile("/out/models/index.ts", "");

        expect(listGeneratedBarrelDirs(project, "/out")).toEqual(["models", "resources", "validators"]);
    });
});
