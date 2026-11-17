import { registerCompileCheckSuite } from "@ng-openapi/testing";

registerCompileCheckSuite("ng-openapi compile-check", (input, output) => ({
    input,
    output,
    options: {
        dateType: "Date",
        enumStyle: "enum",
        generateEnumBasedOnDescription: true,
        generateServices: true,
    },
}));

// naming decorates model identifiers at both their declaration and every
// reference; fixMissingImports silently drops the import when they diverge,
// so only a compile check catches a desync between the two call sites
registerCompileCheckSuite("ng-openapi compile-check (naming)", (input, output) => ({
    input,
    output,
    options: {
        dateType: "Date",
        enumStyle: "enum",
        generateServices: true,
        useSingleRequestParameter: true,
        naming: {
            services: { prefix: "Api" },
            models: { suffix: "Dto" },
        },
    },
}));

// per-type model files compute cross-model imports manually (no language
// service); only a strict compile pass proves every reference in every
// split file actually resolves, including decorated identifiers and the
// request-params barrel interplay
registerCompileCheckSuite("ng-openapi compile-check (per-type models)", (input, output) => ({
    input,
    output,
    options: {
        dateType: "Date",
        enumStyle: "union",
        generateServices: true,
        useSingleRequestParameter: true,
        modelFileStructure: "per-type",
        naming: {
            models: { suffix: "Dto" },
        },
    },
}));

// customHeaders emits the default-header guards into every method body —
// the only compile coverage that branch gets, since no golden variant sets it
registerCompileCheckSuite("ng-openapi compile-check (custom headers)", (input, output) => ({
    input,
    output,
    options: {
        dateType: "Date",
        enumStyle: "enum",
        generateServices: true,
        customHeaders: {
            "X-Api-Key": "demo-key",
            "X-Client-Version": "1.2.3",
        },
    },
}));

// Author-supplied enum member names are spliced in as identifiers: enum
// members in the suite above, where generateEnumBasedOnDescription names
// ReminderLeadTime from its JSON description, and here the keys of the union
// style's const object. The hosted specs name TaskEffort through x-enumNames
// and SyncState through x-enum-varnames.
registerCompileCheckSuite("ng-openapi compile-check (enum names)", (input, output) => ({
    input,
    output,
    options: {
        dateType: "Date",
        enumStyle: "union",
        generateServices: true,
        generateEnumBasedOnDescription: true,
        enumNameExtensions: ["x-enum-varnames", "x-enumNames"],
    },
}));
