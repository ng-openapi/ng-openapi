---
description: "The package property: emit package.json, ng-package.json and friends so the generated client builds and publishes as an npm package."
title: Package
---

# `package`

**Type:** `PackageConfig | undefined` | **Default:** `undefined`

When set, the output directory is generated as a standalone Angular library: next to the client code, ng-openapi writes the files ng-packagr needs to build it and npm needs to publish it. Leave it unset to keep generating source files for use inside an existing project.

See the [publishing guide](../../guide/npm-package.md) for the end-to-end workflow.

## Usage

```typescript
// openapi.config.ts
import { defineConfig } from "ng-openapi";

export default defineConfig({
    input: "./petstore.yaml",
    output: "./packages/petstore-client",
    clientName: "Petstore",
    options: { dateType: "Date", enumStyle: "union" },
    package: {
        name: "@acme/petstore-client",
    },
});
```

## Properties

| Property          | Type                                  | Default                                 | Description                                                                    |
| ----------------- | ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `name`            | `string`                              | —                                       | npm package name (`@scope/name` or `name`). Required.                          |
| `version`         | `string`                              | the spec's `info.version`, else `0.0.0` | package.json `version`. Must be a semver version when set.                     |
| `repository`      | `string \| { type, url, directory? }` | `undefined`                             | package.json `repository`.                                                     |
| `publishRegistry` | `string`                              | `undefined`                             | Written as `publishConfig.registry`, for private registries.                   |
| `angularVersion`  | `string`                              | detected from the workspace             | Angular major the package targets, as a semver range (`"^20.0.0"`). See below. |
| `packageJson`     | `Record<string, unknown>`             | `undefined`                             | Extra package.json fields, deep-merged onto the generated ones. See below.     |

## Generated files

| File              | Content                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`    | name, version, `peerDependencies`, the ng-packagr toolchain as `devDependencies`, `scripts.build`, `sideEffects: false`, plus your `packageJson` |
| `ng-package.json` | ng-packagr project file; its entry point is the generated root `index.ts`                                                                        |
| `tsconfig.json`   | Library compiler settings, including `compilationMode: "partial"` — the mode Angular requires for libraries published to npm                     |
| `README.md`       | Build, publish and usage instructions for this client, naming its `provide<ClientName>Client()` function                                         |
| `.gitignore`      | `node_modules/` and `dist/`                                                                                                                      |

All five are regenerated on every run, exactly like the rest of the output. Customize them through this option — an edit to a generated file is overwritten by the next run.

### Peer dependencies

`peerDependencies` are derived from the generated code itself: every package the emitted files import is listed, so adding the [Zod plugin](plugins/zod.md) adds `zod` to the peers without further configuration. `@angular/*` packages get the range from `angularVersion`; ng-openapi ships known ranges for `rxjs` and `zod`. A package it has no range for is pinned to `"*"` with a warning naming it — set the real range via `packageJson.peerDependencies`.

### Angular version

The `@angular/*` peer range and the versions of `ng-packagr`, `@angular/compiler-cli` & co. in `devDependencies` all follow one Angular major. It is taken from `angularVersion` when set; otherwise from the `@angular/core` installed in the workspace ng-openapi runs in (`21.2.13` → `^21.0.0`); otherwise ng-openapi assumes the Angular major it is itself built against and warns, since that is a guess. Set `angularVersion` explicitly when the generator runs somewhere other than the Angular workspace that will consume the package — a CI job without Angular installed, for instance.

### `packageJson` overrides

Anything package.json accepts can be added or changed here. Nested objects merge key by key, other values are replaced, and your values win:

```typescript
package: {
    name: "@acme/petstore-client",
    packageJson: {
        license: "MIT",
        author: "Acme Platform Team",
        publishConfig: { access: "restricted" },
        scripts: { release: "npm run build && cd dist && npm publish" },
        peerDependencies: { rxjs: "^7.8.0 || ^8.0.0" },
    },
},
```

Two limits keep the generated file consistent with the generated code:

- `name` is rejected here — set `package.name`.
- A derived peer dependency's range can be changed, but the entry cannot be removed while the generated code still imports the package.

## Notes

- `version` in a CI pipeline usually comes from outside the spec: `version: process.env["PKG_VERSION"]` in the config file works, since the config is plain TypeScript.
- A spec whose `info.version` is not a semver version (`"1.0"`, `"v2"`) still generates, with a warning: npm would refuse to publish that version, so set `package.version`.
- `typescript` is deliberately not pinned in `devDependencies`; npm installs the version `@angular/compiler-cli` declares as its peer, which is the right one for the chosen Angular major.
- The generated `build` script passes the emitted `tsconfig.json` explicitly (`-c tsconfig.json`). Without `-c`, ng-packagr compiles with its own built-in configuration and ignores the file.
