import { Project, ScriptKind } from "ts-morph";
import { describe, expect, it } from "vitest";
import { emitJsonFile, emitTextFile, listImportedPackageNames } from "../src";

const createProject = () => new Project({ useInMemoryFileSystem: true });

describe("emitJsonFile", () => {
    it("registers a two-space-indented JSON file with a trailing newline", () => {
        const project = createProject();
        emitJsonFile(project, "/out/package.json", { name: "x", nested: { a: [1, 2] } });

        const file = project.getSourceFileOrThrow("/out/package.json");
        expect(file.getScriptKind()).toBe(ScriptKind.JSON);
        expect(file.getFullText()).toBe(
            '{\n  "name": "x",\n  "nested": {\n    "a": [\n      1,\n      2\n    ]\n  }\n}\n',
        );
    });

    it("overwrites a file registered earlier in the same run", () => {
        const project = createProject();
        emitJsonFile(project, "/out/package.json", { version: "1" });
        emitJsonFile(project, "/out/package.json", { version: "2" });

        expect(project.getSourceFiles()).toHaveLength(1);
        expect(project.getSourceFileOrThrow("/out/package.json").getFullText()).toContain('"version": "2"');
    });
});

describe("emitTextFile", () => {
    it("keeps the text byte-for-byte, including characters TypeScript would choke on", () => {
        const project = createProject();
        const text = "# Title\n\nSome *markdown* with `code`, a ' quote, a } brace and a trailing space \n";
        emitTextFile(project, "/out/README.md", text);

        const file = project.getSourceFileOrThrow("/out/README.md");
        expect(file.getScriptKind()).toBe(ScriptKind.Deferred);
        expect(file.getFullText()).toBe(text);
    });

    it("survives project.save() unchanged", async () => {
        const project = createProject();
        emitTextFile(project, "/out/.gitignore", "node_modules/\ndist/\n");
        emitJsonFile(project, "/out/tsconfig.json", { compilerOptions: { strict: true } });
        await project.save();

        const fs = project.getFileSystem();
        expect(fs.readFileSync("/out/.gitignore")).toBe("node_modules/\ndist/\n");
        expect(fs.readFileSync("/out/tsconfig.json")).toBe('{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n');
    });

    it("is invisible to the language service that resolves auto-imports", () => {
        // A README that happens to contain `export` must not become an import
        // candidate for fixMissingImports(), which the .ts generators rely on
        const project = createProject();
        emitTextFile(project, "/out/README.md", "export const Leak = 1;\n");
        project.createSourceFile("/out/models/index.ts", "export interface Real { a: number }\n");
        const consumer = project.createSourceFile("/out/consumer.ts", "const a: Real = { a: 1 }; const b = Leak;\n");

        consumer.fixMissingImports();

        expect(consumer.getFullText()).toContain('import { Real } from "./models"');
        expect(consumer.getFullText()).not.toContain("README");
    });
});

describe("listImportedPackageNames", () => {
    it("returns [] for a project without imports", () => {
        const project = createProject();
        project.createSourceFile("/out/models/index.ts", "export interface A { a: number }\n");
        expect(listImportedPackageNames(project)).toEqual([]);
    });

    it("reduces specifiers to their package root and ignores relative and node: imports", () => {
        const project = createProject();
        project.createSourceFile(
            "/out/services/a.service.ts",
            [
                'import { Injectable } from "@angular/core";',
                'import { HttpClient } from "@angular/common/http";',
                'import { map } from "rxjs/operators";',
                'import type { A } from "../models";',
                'import { join } from "node:path";',
                'export { Observable } from "rxjs";',
                'export * from "./index";',
            ].join("\n"),
        );

        expect(listImportedPackageNames(project)).toEqual(["@angular/common", "@angular/core", "rxjs"]);
    });

    it("collects across files, deduplicates and sorts", () => {
        const project = createProject();
        project.createSourceFile("/out/validators/a.validator.ts", 'import { z } from "zod";\n');
        project.createSourceFile("/out/validators/b.validator.ts", 'import { z } from "zod";\n');
        project.createSourceFile("/out/services/a.service.ts", 'import { Injectable } from "@angular/core";\n');

        expect(listImportedPackageNames(project)).toEqual(["@angular/core", "zod"]);
    });

    it("skips the JSON and text files the scaffold itself registers", () => {
        const project = createProject();
        project.createSourceFile("/out/services/a.service.ts", 'import { Injectable } from "@angular/core";\n');
        emitTextFile(project, "/out/README.md", 'import { nothing } from "not-a-dependency";\n');
        emitJsonFile(project, "/out/package.json", { name: "x" });

        expect(listImportedPackageNames(project)).toEqual(["@angular/core"]);
    });
});
