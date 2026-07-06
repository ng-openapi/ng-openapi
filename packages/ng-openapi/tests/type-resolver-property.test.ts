import { describe, expect, it } from "vitest";
import { Project, ScriptTarget } from "ts-morph";
import { normalizeSchema, SwaggerDefinition, TypeGenOptions } from "@ng-openapi/shared";
import { TypeResolver } from "../src/lib/generators/type/type-resolver";

/**
 * Property-based test: for randomly generated
 * schemas, the pipeline `raw schema → normalizeSchema → TypeResolver.resolve`
 * must always produce a type expression the TypeScript compiler accepts under
 * strict mode. Hand-rolled seeded PRNG — deterministic, no dependency; bump
 * CASE_COUNT locally when hunting for counterexamples.
 */

const SEED = 0xc0ffee;
const CASE_COUNT = 300;
const MAX_DEPTH = 3;

/** mulberry32 — tiny deterministic PRNG. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const random = mulberry32(SEED);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const maybe = <T>(value: T): T | undefined => (random() < 0.5 ? value : undefined);

// Referenced names must pre-exist in the compiled probe file; the pool uses
// names that pascalCaseForEnums maps to themselves.
const REF_POOL = ["RefAlpha", "RefBeta", "RefGamma"] as const;

// Deliberately nasty inputs: separators, digits-first, quotes, backslashes
const PROPERTY_NAMES = ["plain", "kebab-name", "123first", "with space", "$dollar", "dot.ted"] as const;
const STRING_VALUES = ["simple", "it's quoted", "back\\slash", "1-digit first", "ümlaut"] as const;
const FORMATS = ["date", "date-time", "binary", "uuid", "email", "unknown-format"] as const;

function randomSchema(depth: number): SwaggerDefinition {
    const branches: Array<() => SwaggerDefinition> = [
        // primitives (occasionally as 3.1 type arrays with null)
        () => {
            const type = pick(["string", "number", "integer", "boolean"] as const);
            const asTypeArray = random() < 0.3;
            return {
                type: (asTypeArray ? [type, "null"] : type) as SwaggerDefinition["type"],
                format: maybe(pick(FORMATS)),
                nullable: maybe(true),
            };
        },
        // enums: strings with hostile characters, numbers, or mixed
        () => ({
            enum:
                random() < 0.5
                    ? [pick(STRING_VALUES), pick(STRING_VALUES)]
                    : [Math.floor(random() * 100), pick(STRING_VALUES)],
        }),
        // 3.1 const — including the non-primitive values the normalizer must
        // refuse to fold (they'd otherwise render "[object Object]" as a type)
        () =>
            ({
                const: pick([
                    pick(STRING_VALUES),
                    Math.floor(random() * 100),
                    true,
                    false,
                    null,
                    { kind: "object-const" },
                    [1, 2, 3],
                ] as const),
            }) as SwaggerDefinition,
        // $ref into the predeclared pool
        () => ({ $ref: `#/components/schemas/${pick(REF_POOL)}` }),
    ];

    if (depth < MAX_DEPTH) {
        branches.push(
            // arrays (incl. tuple-style items)
            () => ({
                type: "array",
                items: random() < 0.2 ? [randomSchema(depth + 1), randomSchema(depth + 1)] : randomSchema(depth + 1),
            }),
            // inline objects with hostile property names and partial requiredness
            () => {
                const names = [pick(PROPERTY_NAMES), pick(PROPERTY_NAMES)];
                const properties: Record<string, SwaggerDefinition> = {};
                for (const name of names) {
                    properties[name] = randomSchema(depth + 1);
                }
                return {
                    type: "object" as const,
                    properties,
                    required: maybe([names[0]]),
                };
            },
            // objects typed only through additionalProperties
            () => ({
                type: "object" as const,
                additionalProperties: random() < 0.5 ? randomSchema(depth + 1) : true,
            }),
            // compositions
            () => ({ allOf: [randomSchema(depth + 1), randomSchema(depth + 1)] }),
            () => ({ oneOf: [randomSchema(depth + 1), randomSchema(depth + 1)] }),
            () => ({ anyOf: [randomSchema(depth + 1), randomSchema(depth + 1)] }),
        );
    }

    return pick(branches)();
}

const config: TypeGenOptions = { options: { dateType: "Date", enumStyle: "enum" } };

describe("TypeResolver property test", () => {
    it(`resolves ${CASE_COUNT} random schemas to strict-compilable type expressions`, () => {
        const resolver = new TypeResolver(config);
        const schemas: SwaggerDefinition[] = [];
        const aliases: string[] = [];

        for (let i = 0; i < CASE_COUNT; i++) {
            const schema = randomSchema(0);
            schemas.push(schema);
            const resolved = resolver.resolve(normalizeSchema(schema));
            expect(resolved.trim().length, `schema #${i} resolved to an empty type`).toBeGreaterThan(0);
            aliases.push(`type Case${i} = ${resolved};`);
        }

        const project = new Project({
            useInMemoryFileSystem: true,
            compilerOptions: {
                target: ScriptTarget.ES2022,
                strict: true,
                noImplicitAny: true,
                lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
            },
        });

        const source = [
            ...REF_POOL.map((name) => `export interface ${name} { marker?: string }`),
            ...aliases,
        ].join("\n");
        const file = project.createSourceFile("probe.ts", source);

        const diagnostics = file.getPreEmitDiagnostics();
        const failures = diagnostics.map((diagnostic) => {
            const line = diagnostic.getLineNumber() ?? 0;
            const caseIndex = line - REF_POOL.length - 1;
            const schema = schemas[caseIndex] ? JSON.stringify(schemas[caseIndex]) : "<unknown>";
            return `line ${line}: ${JSON.stringify(diagnostic.getMessageText())}\n  schema: ${schema}\n  alias: ${aliases[caseIndex] ?? "<unknown>"}`;
        });

        expect(failures, `SEED=0x${SEED.toString(16)} produced non-compiling types:\n${failures.join("\n")}`).toEqual(
            [],
        );
    });

    it("resolves deterministically for identical schema objects", () => {
        const resolver = new TypeResolver(config);
        const schema = normalizeSchema({
            type: "object",
            properties: { "kebab-name": { enum: ["a'b", 1] }, nested: { allOf: [{ type: "string" }] } },
        });
        expect(resolver.resolve(schema)).toBe(resolver.resolve(schema));
        expect(new TypeResolver(config).resolve(schema)).toBe(resolver.resolve(schema));
    });
});
