import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { generateFromConfig } from "ng-openapi";
import type { SwaggerDefinition } from "@ng-openapi/shared";

/**
 * Performance benchmark fixture: a synthesized
 * large spec keeps the batch AST emission honest after the de-caching refactor.
 * The ceiling is deliberately generous — it exists to catch *pathological*
 * regressions (accidentally quadratic emission, per-schema formatText, …),
 * not to measure machines. The actual duration is logged for trend-watching
 * in CI logs.
 */

const SCHEMA_COUNT = 150;
const OPERATION_COUNT = 120;
const CEILING_MS = 90_000;

function buildLargeSpec(): object {
    const schemas: Record<string, SwaggerDefinition> = {};
    for (let i = 0; i < SCHEMA_COUNT; i++) {
        const properties: Record<string, SwaggerDefinition> = {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            count: { type: "integer" },
            status: { type: "string", enum: ["active", "inactive", "archived"] },
            tags: { type: "array", items: { type: "string" } },
        };
        // Cross-references keep the resolver honest
        if (i > 0) {
            properties.parent = { $ref: `#/components/schemas/Entity${i - 1}` };
            properties.related = { type: "array", items: { $ref: `#/components/schemas/Entity${Math.floor(i / 2)}` } };
        }
        schemas[`Entity${i}`] = {
            type: "object",
            required: ["id", "name"],
            properties,
            description: `Synthesized entity #${i}`,
        };
    }

    const paths: Record<string, object> = {};
    for (let i = 0; i < OPERATION_COUNT; i++) {
        const entity = `Entity${i % SCHEMA_COUNT}`;
        const tag = `Group${i % 10}`;
        paths[`/entities/${i}/{id}`] = {
            get: {
                operationId: `getEntity${i}`,
                tags: [tag],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                    { name: "verbose", in: "query", schema: { type: "boolean" } },
                    { name: "page-size", in: "query", schema: { type: "integer" } },
                ],
                responses: {
                    "200": {
                        description: "ok",
                        content: { "application/json": { schema: { $ref: `#/components/schemas/${entity}` } } },
                    },
                },
            },
            post: {
                operationId: `updateEntity${i}`,
                tags: [tag],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: { $ref: `#/components/schemas/${entity}` } } },
                },
                responses: {
                    "200": {
                        description: "ok",
                        content: { "application/json": { schema: { $ref: `#/components/schemas/${entity}` } } },
                    },
                },
            },
        };
    }

    return {
        openapi: "3.0.3",
        info: { title: "perf-benchmark", version: "1.0.0" },
        paths,
        components: { schemas },
    };
}

const tmpRoot = join(process.cwd(), "tmp", "ng-openapi-tests");
mkdirSync(tmpRoot, { recursive: true });
const tempDirs: string[] = [];

afterAll(() => {
    for (const dir of tempDirs) {
        try {
            rmSync(dir, { recursive: true, force: true });
        } catch {
            // best-effort cleanup
        }
    }
});

describe("generation performance benchmark", () => {
    it(
        `generates a ${SCHEMA_COUNT}-schema / ${OPERATION_COUNT}-operation spec within the ceiling`,
        async () => {
            const dir = mkdtempSync(join(tmpRoot, "perf-"));
            tempDirs.push(dir);
            const input = join(dir, "large-spec.json");
            writeFileSync(input, JSON.stringify(buildLargeSpec()));

            const output = join(dir, "out");
            const result = await generateFromConfig({
                input,
                output,
                options: { dateType: "Date", enumStyle: "enum" },
            });

            // eslint-disable-next-line no-console -- benchmark trend line for CI logs (test-only)
            console.log(
                `perf-benchmark: ${result.filesWritten.length} files in ${result.durationMs}ms ` +
                    `(${SCHEMA_COUNT} schemas, ${OPERATION_COUNT} operations)`,
            );

            expect(result.filesWritten.length).toBeGreaterThan(10);
            expect(result.warnings).toEqual([]);
            expect(result.durationMs).toBeLessThan(CEILING_MS);
        },
        CEILING_MS + 30_000,
    );
});
