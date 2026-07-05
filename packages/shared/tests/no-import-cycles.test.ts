import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards against import cycles across all workspace source files.
 *
 * Phase 1.1 of REFACTORING_PLAN.md removed two barrel-driven cycles in
 * packages/shared (core -> types -> core); this test keeps them from coming
 * back. It runs as a test (not a lint rule) because CI runs the test suite on
 * every PR — lint joins CI in phase 4.
 *
 * Note: TypeScript `import type` statements are erased at compile time and do
 * not create runtime cycles, so they are ignored here.
 */

const ROOT = resolve(__dirname, "..", "..", "..");

const SOURCE_ROOTS = [
    "packages/shared/src",
    "packages/ng-openapi/src",
    "packages/plugins/http-resource/src",
    "packages/plugins/zod/src",
    "packages/testing/src",
];

/** Workspace aliases, mirroring vitest.config.ts / tsconfig paths. */
const ALIASES: Record<string, string> = {
    "@ng-openapi/shared": "packages/shared/src/index.ts",
    "@ng-openapi/testing": "packages/testing/src/index.ts",
    "ng-openapi": "packages/ng-openapi/src/index.ts",
};

function listSourceFiles(): string[] {
    return SOURCE_ROOTS.flatMap((root) =>
        readdirSync(join(ROOT, root), { withFileTypes: true, recursive: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts"))
            .map((entry) => join(entry.parentPath, entry.name)),
    );
}

/** Module specifiers of runtime imports/re-exports (type-only ones excluded). */
function importSpecifiers(source: string): string[] {
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const pattern = /(?:^|\n)\s*(import|export)\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;
    const specifiers: string[] = [];
    for (const match of withoutComments.matchAll(pattern)) {
        const isTypeOnly = !!match[2];
        if (!isTypeOnly) {
            specifiers.push(match[3]);
        }
    }
    return specifiers;
}

function resolveSpecifier(fromFile: string, specifier: string): string | undefined {
    let base: string;
    if (specifier.startsWith(".")) {
        base = resolve(dirname(fromFile), specifier);
    } else if (ALIASES[specifier]) {
        return join(ROOT, ALIASES[specifier]);
    } else {
        return undefined; // external dependency
    }

    for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

function findCycle(graph: Map<string, string[]>): string[] | undefined {
    const WHITE = 0,
        GRAY = 1,
        BLACK = 2;
    const color = new Map<string, number>();
    const stack: string[] = [];

    const visit = (node: string): string[] | undefined => {
        color.set(node, GRAY);
        stack.push(node);
        for (const next of graph.get(node) ?? []) {
            const c = color.get(next) ?? WHITE;
            if (c === GRAY) {
                return [...stack.slice(stack.indexOf(next)), next];
            }
            if (c === WHITE) {
                const cycle = visit(next);
                if (cycle) return cycle;
            }
        }
        stack.pop();
        color.set(node, BLACK);
        return undefined;
    };

    for (const node of graph.keys()) {
        if ((color.get(node) ?? WHITE) === WHITE) {
            const cycle = visit(node);
            if (cycle) return cycle;
        }
    }
    return undefined;
}

describe("workspace import graph", () => {
    it("contains no import cycles", () => {
        const graph = new Map<string, string[]>();
        for (const file of listSourceFiles()) {
            const targets = importSpecifiers(readFileSync(file, "utf8"))
                .map((specifier) => resolveSpecifier(file, specifier))
                .filter((target): target is string => !!target);
            graph.set(file, targets);
        }

        expect(graph.size).toBeGreaterThan(50); // guard against a silently empty scan

        const cycle = findCycle(graph);
        const pretty = cycle?.map((f) => f.split(sep).join("/").split("packages/")[1]).join("\n  -> ");
        expect(cycle, `Import cycle found:\n  -> ${pretty}`).toBeUndefined();
    });
});
