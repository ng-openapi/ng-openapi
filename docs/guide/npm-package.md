---
description: "Generate the client as a standalone npm package: build it with ng-packagr in CI, publish it to a registry, install it in any Angular application."
title: Publishing as an npm Package
---

# Publishing as an npm Package

By default ng-openapi generates source files for use inside an existing Angular project. When several applications consume the same API — or the API's team wants to ship the client rather than the spec — generate the client as its own npm package instead: build it once in CI, publish it, and let applications `npm install` it.

## Overview

Setting the [`package`](../api/configuration/package.md) option adds the files an Angular library needs to the output directory:

```
petstore-client/
├── package.json       ← name, version, description, dependencies, build script
├── ng-package.json    ← ng-packagr project file
├── tsconfig.json      ← library compiler settings
├── README.md          ← build, publish and usage instructions for this client
├── .gitignore
├── index.ts           ← the library's public API (unchanged)
├── models/
├── services/
└── …
```

Nothing about the client code itself changes; the same `index.ts`, models, services, tokens and providers are generated, and the package's public API is that root `index.ts`.

## 1. Configure

```typescript
// openapi.config.ts
import { defineConfig } from "ng-openapi";

export default defineConfig({
    input: "./petstore.yaml",
    output: "./petstore-client",
    clientName: "Petstore",
    options: {
        dateType: "Date",
        enumStyle: "union",
    },
    package: {
        name: "@acme/petstore-client",
        // Falls back to the spec's info.version when unset; must be bare
        // MAJOR.MINOR.PATCH, so a "v1.2.3" tag needs its prefix stripped
        version: process.env["PKG_VERSION"]?.replace(/^v/, ""),
        repository: "https://github.com/acme/petstore-client",
        packageJson: {
            license: "MIT",
            publishConfig: { access: "restricted" },
        },
    },
});
```

`name` is the only required field. The generated `package.json` declares `peerDependencies` on exactly the packages the generated code imports (`@angular/core`, `@angular/common`, `rxjs`, plus `zod` when the Zod plugin is configured), and `devDependencies` on the ng-packagr toolchain matching the Angular major in use — see the [`package` reference](../api/configuration/package.md#angular-version) for how that major is chosen and when to pin it with `angularVersion`.

## 2. Generate and build

```bash
npx ng-openapi -c openapi.config.ts
cd petstore-client
npm install
npm run build
```

`npm run build` runs ng-packagr, which compiles the library in the [Angular Package Format](https://angular.dev/tools/libraries/angular-package-format) into `dist/`: an ES module bundle, type declarations, the README and a `package.json` with the build-only fields stripped.

## 3. Publish

```bash
cd dist
npm publish
```

Publishing from `dist/` is what ng-packagr expects — the source directory's `package.json` carries `devDependencies` and `scripts` that do not belong in the published package. For a private registry, set `publishRegistry` in the config and ng-openapi writes it to `publishConfig.registry`, so `npm publish` needs no extra flags.

## 4. Consume

In any Angular application:

```bash
npm install @acme/petstore-client
```

```typescript
// app.config.ts
import { ApplicationConfig } from "@angular/core";
import { provideHttpClient } from "@angular/common/http";
import { providePetstoreClient } from "@acme/petstore-client";

export const appConfig: ApplicationConfig = {
    providers: [provideHttpClient(), providePetstoreClient({ basePath: "https://api.acme.com" })],
};
```

Services, models and tokens are imported from the package exactly as they would be from a generated directory — the [Angular integration guide](./angular-integration.md) applies unchanged.

## In CI

A typical pipeline regenerates the client from the current spec, builds it and publishes it with a version derived from the pipeline:

```yaml
- run: npm ci
- run: npx ng-openapi -c openapi.config.ts
  env:
      PKG_VERSION: ${{ github.ref_name }} # "v1.2.3" on a tag; the config strips the "v"
# npm install, not npm ci: the generated directory has no lockfile
- run: npm install && npm run build
  working-directory: petstore-client
- run: npm publish
  working-directory: petstore-client/dist
  env:
      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Two things to keep in mind:

- The generator picks the Angular major from the `@angular/core` installed where it runs. In a job that has no Angular installed, set `package.angularVersion` explicitly so the package targets the Angular your applications use, not a guessed default.
- Every scaffold file is regenerated on each run. Put customizations in the config's `packageJson` override rather than editing the generated `package.json`, or they are lost on the next generation.
- Give the package a directory of its own. The scaffold refuses to overwrite a `package.json`, `tsconfig.json`, `README.md`, `ng-package.json` or `.gitignore` it did not generate (it recognizes its own by a stamp in `package.json`), so `output: "."` in a repository with its own `package.json` fails with an `OutputConflictError` rather than replacing it.

## What is not generated

- **A `LICENSE` file.** Set `packageJson.license` for the SPDX identifier npm reads; drop a `LICENSE` file into the output directory yourself if you want the text shipped — ng-packagr copies it into `dist/`.
- **`typescript` in `devDependencies`.** Its compatible range differs per Angular major; npm 7+ and pnpm install the one `@angular/compiler-cli` declares as a peer. Yarn does not — add it through `packageJson.devDependencies` there.
