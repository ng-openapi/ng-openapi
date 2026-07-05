---
description: "Write your own ng-openapi generator plugin against the documented plugin contract."
title: Plugin Authoring
---

# Plugin Authoring

ng-openapi plugins are generator classes that run after the core type/service generation and emit additional files into the same output directory. The built-in [HttpResourcePlugin](../api/configuration/plugins/http-resource.md) and [ZodPlugin](../api/configuration/plugins/zod.md) are implemented against the exact contract described here — a third-party plugin needs nothing beyond the public `ng-openapi` API.

## The contract

A plugin is a class implementing `IPluginGenerator`, constructed by the orchestrator with a single `PluginGeneratorContext` argument:

```typescript
import { IPluginGenerator, PluginGeneratorContext } from "ng-openapi";
import * as path from "path";

export class MyPlugin implements IPluginGenerator {
    private readonly context: PluginGeneratorContext;

    constructor(context: PluginGeneratorContext) {
        this.context = context;
    }

    async generate(outputRoot: string): Promise<void> {
        const { spec, project, onWarning } = this.context;

        if (spec.operations.length === 0) {
            onWarning?.("Nothing to generate: the specification has no operations");
            return;
        }

        const file = project.createSourceFile(path.join(outputRoot, "my-plugin", "index.ts"), "", {
            overwrite: true,
        });
        // ... build the file from spec.operations / spec.definitions ...
        file.formatText();
        file.saveSync();
    }
}
```

Users register the class in their config:

```typescript
export default {
    // ...
    plugins: [MyPlugin],
} as GeneratorConfig;
```

## What the context provides

| Field | Type | Notes |
|---|---|---|
| `spec` | `NormalizedSpec` | The version-free spec model. `$ref`s are resolved and per-operation fields (`pathParams`, `queryParams`, `hasBody`, `isMultipart`, `responseType`, …) are precomputed. Plugins never see Swagger 2.0 vs OpenAPI 3.x differences. |
| `project` | `Project` (ts-morph) | The shared project every generator emits through. Create files via `project.createSourceFile(...)` so the orchestrator can report them in `GenerationResult.filesWritten`. |
| `config` | `GeneratorConfig` | The full user-facing config. Read only the slice you need (e.g. `config.clientName`, `config.options.dateType`). |
| `onWarning` | `(message: string) => void` (optional) | Sink for non-fatal diagnostics. Never `console.*` from a plugin — warnings surface on `GenerationResult.warnings` and through the CLI's reporter. |

## Rules of engagement

- **Consume `NormalizedSpec`, not the raw spec.** All version quirks are resolved at parse time; if something you need is missing from the model, that is a gap to raise upstream, not a reason to re-parse the input.
- **Never log.** The core is silent by design; the CLI owns presentation. Report problems through `onWarning` or by throwing an `Error` (which aborts generation with a clean CLI message).
- **Emit through the shared `project`.** Files written behind its back won't be tracked, formatted consistently, or visible to `fixMissingImports()`.
- **Validation is done for you.** By the time a plugin is constructed, the spec has been parsed, validated, and normalized — no need for your own guards.
