# Graph Report - .  (2026-07-05)

## Corpus Check
- Corpus is ~30,930 words - fits in a single context window. You may not need a graph.

## Summary
- 954 nodes · 1596 edges · 76 communities (65 shown, 11 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.8)
- Token cost: 197,810 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core Generation Pipeline|Core Generation Pipeline]]
- [[_COMMUNITY_Service Method Generators|Service Method Generators]]
- [[_COMMUNITY_Method Body Generation|Method Body Generation]]
- [[_COMMUNITY_Package Manifests & Exports|Package Manifests & Exports]]
- [[_COMMUNITY_Zod Schema Generation|Zod Schema Generation]]
- [[_COMMUNITY_Documentation & Guides|Documentation & Guides]]
- [[_COMMUNITY_Type Resolution & Params|Type Resolution & Params]]
- [[_COMMUNITY_Build Scripts|Build Scripts]]
- [[_COMMUNITY_Swagger Type Generation|Swagger Type Generation]]
- [[_COMMUNITY_Dev Dependencies|Dev Dependencies]]
- [[_COMMUNITY_Nx Project Targets|Nx Project Targets]]
- [[_COMMUNITY_Nx Project Targets|Nx Project Targets]]
- [[_COMMUNITY_Release-Please Config|Release-Please Config]]
- [[_COMMUNITY_Base TS Compiler Options|Base TS Compiler Options]]
- [[_COMMUNITY_CICD Workflows|CI/CD Workflows]]
- [[_COMMUNITY_Nx Project Targets|Nx Project Targets]]
- [[_COMMUNITY_Root TS Config|Root TS Config]]
- [[_COMMUNITY_App TS Config|App TS Config]]
- [[_COMMUNITY_Plugin Package Config|Plugin Package Config]]
- [[_COMMUNITY_Library TS Compiler Options|Library TS Compiler Options]]
- [[_COMMUNITY_Library TS Compiler Options|Library TS Compiler Options]]
- [[_COMMUNITY_Library TS Compiler Options|Library TS Compiler Options]]
- [[_COMMUNITY_Docs Package Metadata|Docs Package Metadata]]
- [[_COMMUNITY_Package Metadata|Package Metadata]]
- [[_COMMUNITY_Date Transformation|Date Transformation]]
- [[_COMMUNITY_Plugins Changelog|Plugins Changelog]]
- [[_COMMUNITY_Nx Workspace Config|Nx Workspace Config]]
- [[_COMMUNITY_Local Registry Target|Local Registry Target]]
- [[_COMMUNITY_Root Package Manifest|Root Package Manifest]]
- [[_COMMUNITY_Peer Dependencies|Peer Dependencies]]
- [[_COMMUNITY_Package Manifest|Package Manifest]]
- [[_COMMUNITY_Runtime Dependencies|Runtime Dependencies]]
- [[_COMMUNITY_Library TS Config|Library TS Config]]
- [[_COMMUNITY_Library TS Config|Library TS Config]]
- [[_COMMUNITY_Library TS Config|Library TS Config]]
- [[_COMMUNITY_Library TS Config|Library TS Config]]
- [[_COMMUNITY_Library TS Config|Library TS Config]]
- [[_COMMUNITY_Nx Project Definition|Nx Project Definition]]
- [[_COMMUNITY_Nx Project Definition|Nx Project Definition]]
- [[_COMMUNITY_Nx Project Definition|Nx Project Definition]]
- [[_COMMUNITY_Optional Peer Deps|Optional Peer Deps]]
- [[_COMMUNITY_Angular Peer Deps|Angular Peer Deps]]
- [[_COMMUNITY_Brand Identity & Logo|Brand Identity & Logo]]
- [[_COMMUNITY_Author Metadata|Author Metadata]]
- [[_COMMUNITY_Repository Metadata|Repository Metadata]]
- [[_COMMUNITY_Type Helpers|Type Helpers]]
- [[_COMMUNITY_Author Metadata|Author Metadata]]
- [[_COMMUNITY_Export Map|Export Map]]
- [[_COMMUNITY_Repository Metadata|Repository Metadata]]
- [[_COMMUNITY_Enum Generation Options|Enum Generation Options]]
- [[_COMMUNITY_Nx Named Inputs|Nx Named Inputs]]
- [[_COMMUNITY_Node Engines|Node Engines]]
- [[_COMMUNITY_Funding Metadata|Funding Metadata]]
- [[_COMMUNITY_Angular Peer Deps|Angular Peer Deps]]
- [[_COMMUNITY_Publish Config|Publish Config]]
- [[_COMMUNITY_Publish Scripts|Publish Scripts]]
- [[_COMMUNITY_Node Engines|Node Engines]]
- [[_COMMUNITY_Funding Metadata|Funding Metadata]]
- [[_COMMUNITY_Publish Config|Publish Config]]
- [[_COMMUNITY_Publish Scripts|Publish Scripts]]
- [[_COMMUNITY_ConfigMetadata Fragment|Config/Metadata Fragment]]
- [[_COMMUNITY_ConfigMetadata Fragment|Config/Metadata Fragment]]
- [[_COMMUNITY_ConfigMetadata Fragment|Config/Metadata Fragment]]
- [[_COMMUNITY_ConfigMetadata Fragment|Config/Metadata Fragment]]
- [[_COMMUNITY_ConfigMetadata Fragment|Config/Metadata Fragment]]
- [[_COMMUNITY_ConfigMetadata Fragment|Config/Metadata Fragment]]
- [[_COMMUNITY_ConfigMetadata Fragment|Config/Metadata Fragment]]
- [[_COMMUNITY_ConfigMetadata Fragment|Config/Metadata Fragment]]
- [[_COMMUNITY_ConfigMetadata Fragment|Config/Metadata Fragment]]

## God Nodes (most connected - your core abstractions)
1. `PathInfo` - 64 edges
2. `GeneratorConfig` - 60 edges
3. `SwaggerParser` - 48 edges
4. `SwaggerDefinition` - 35 edges
5. `scripts` - 32 edges
6. `TypeGenerator` - 32 edges
7. `pascalCase()` - 26 edges
8. `camelCase()` - 25 edges
9. `ServiceMethodBodyGenerator` - 20 edges
10. `ZodSchemaBuilder` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Verdaccio Local Registry Config` --conceptually_related_to--> `Publish to NPM Workflow`  [INFERRED]
  .verdaccio/config.yml → .github/workflows/publish.yml
- `ng-openapi CLI` --references--> `ng-openapi package`  [INFERRED]
  docs/api/cli.md → .github/workflows/publish.yml
- `ng-openapi Changelog` --references--> `ISO_DATE_REGEX`  [INFERRED]
  packages/ng-openapi/CHANGELOG.md → docs/guide/date-handling.md
- `HTTP Resource Plugin` --references--> `HttpResourcePlugin`  [EXTRACTED]
  docs/guide/http-resource.md → packages/plugins/http-resource/README.md
- `Zod validation library` --conceptually_related_to--> `@ng-openapi/zod package`  [INFERRED]
  docs/guide/schema-validation.md → packages/plugins/zod/README.md

## Import Cycles
- 4-file cycle: `packages/shared/src/core/index.ts -> packages/shared/src/core/swagger-parser.ts -> packages/shared/src/types/index.ts -> packages/shared/src/types/plugin.types.ts -> packages/shared/src/core/index.ts`
- 5-file cycle: `packages/shared/src/core/index.ts -> packages/shared/src/core/swagger-parser.ts -> packages/shared/src/types/index.ts -> packages/shared/src/types/config.types.ts -> packages/shared/src/types/plugin.types.ts -> packages/shared/src/core/index.ts`

## Hyperedges (group relationships)
- **NPM Release Pipeline** — _github_workflows_release_please_release_please_workflow, _github_workflows_publish_publish_workflow, _github_workflows_release_pr_prerelease_workflow [EXTRACTED 0.90]
- **Monorepo Published Packages** — pkg_ng_openapi, pkg_http_resource, pkg_zod, pkg_shared [EXTRACTED 0.85]
- **GeneratorConfig Property Set** — docs_api_configuration_client_name_client_name, docs_api_configuration_input_input, docs_api_configuration_compiler_options_compiler_options, docs_api_configuration_options_options [EXTRACTED 0.80]
- **GeneratorConfig options** — docs_api_configuration_options_customize_method_name_customizemethodname, docs_api_configuration_options_date_type_datetype, docs_api_configuration_options_enum_style_enumstyle, docs_api_configuration_options_generate_services_generateservices, docs_api_configuration_output_output [INFERRED 0.85]
- **Date transformation pipeline** — docs_api_configuration_options_date_type_datetype, docs_api_utilities_date_transformer_dateinterceptor, docs_api_utilities_date_transformer_transformdates, docs_api_utilities_date_transformer_iso_date_regex, docs_api_providers_enabledatetransform [INFERRED 0.85]
- **Date transformation pipeline** — docs_guide_date_handling_date_interceptor, docs_guide_date_handling_iso_date_regex, docs_guide_date_handling_transform_dates, docs_guide_date_handling_date_type_option [EXTRACTED 0.90]
- **File download utilities** — docs_guide_file_download_download_file_operator, docs_guide_file_download_download_file, docs_guide_file_download_extract_filename_from_content_disposition, docs_guide_file_download_response_type_mapping [EXTRACTED 0.90]
- **ng-openapi plugin ecosystem** — packages_ng_openapi_readme_ng_openapi_package, packages_plugins_http_resource_readme_http_resource_plugin_package, packages_plugins_zod_readme_zod_plugin_package [INFERRED 0.85]

## Communities (76 total, 11 thin omitted)

### Community 0 - "Core Generation Pipeline"
Cohesion: 0.05
Nodes (23): generateFromOptions(), loadConfigFile(), program, generateFromConfig(), validateInput(), ServiceGenerator, BaseInterceptorGenerator, DateTransformerGenerator (+15 more)

### Community 1 - "Service Method Generators"
Cohesion: 0.06
Nodes (15): RequestParamsGenerator, ServiceIndexGenerator, ServiceMethodGenerator, ServiceMethodOverloadsGenerator, RequestObjectEntry, ServiceMethodRequestObjectGenerator, HttpResourceGenerator, HttpResourceIndexGenerator (+7 more)

### Community 2 - "Method Body Generation"
Cohesion: 0.09
Nodes (10): ServiceMethodBodyGenerator, HttpResourceMethodGenerator, HttpResourceMethodBodyGenerator, HttpResourceMethodParamsGenerator, ZodGenerator, GetMethodGenerationContext, MethodGenerationContext, PathInfo (+2 more)

### Community 3 - "Package Manifests & Exports"
Cohesion: 0.04
Nodes (47): author, email, name, url, bugs, url, description, engines (+39 more)

### Community 4 - "Zod Schema Generation"
Cohesion: 0.10
Nodes (12): DEFAULT_OPTIONS, isReferenceObject(), BuildOptions, ZodPluginOptions, ZodIndexGenerator, ZodSchemaBuilder, ZodSchemaGenerator, EnumValueObject (+4 more)

### Community 5 - "Documentation & Guides"
Cohesion: 0.06
Nodes (41): GeneratorConfig, input configuration option, ng-openapi Installation, Prerequisites (Node 20+, Angular 15+), Generated Structure, provideNgOpenapi, Quick Start, Angular Integration (+33 more)

### Community 6 - "Type Resolution & Params"
Cohesion: 0.10
Nodes (14): ServiceMethodParamsGenerator, TypeSchema, CONTENT_TYPES, placeHolder, getResponseType(), getResponseTypeFromResponse(), inferResponseTypeFromContentType(), isPrimitiveType() (+6 more)

### Community 7 - "Build Scripts"
Cohesion: 0.06
Nodes (32): scripts, build, build:http-resource, build:ng-openapi, build:zod, docs:build, docs:dev, docs:preview (+24 more)

### Community 9 - "Dev Dependencies"
Cohesion: 0.07
Nodes (28): devDependencies, @angular/common, @angular/core, eslint, eslint-config-prettier, @eslint/js, jsonc-eslint-parser, @nx/eslint (+20 more)

### Community 10 - "Nx Project Targets"
Cohesion: 0.09
Nodes (23): executor, options, outputs, name, options, command, cwd, packageRoot (+15 more)

### Community 11 - "Nx Project Targets"
Cohesion: 0.09
Nodes (23): executor, options, outputs, name, options, command, cwd, packageRoot (+15 more)

### Community 12 - "Release-Please Config"
Cohesion: 0.08
Nodes (23): bump-minor-pre-major, bump-patch-for-minor-pre-major, changelog-sections, include-component-in-tag, include-v-in-tag, packages, changelog-path, component (+15 more)

### Community 13 - "Base TS Compiler Options"
Cohesion: 0.09
Nodes (21): compileOnSave, compilerOptions, baseUrl, declaration, emitDecoratorMetadata, experimentalDecorators, importHelpers, lib (+13 more)

### Community 14 - "CI/CD Workflows"
Cohesion: 0.10
Nodes (21): CI Workflow, Publish to NPM Workflow, Release Please Workflow, PR Prerelease Workflow, Semantic PR Title Workflow, Verdaccio Local Registry Config, Conventional Commits Policy, Maintainer Permission Gate (+13 more)

### Community 15 - "Nx Project Targets"
Cohesion: 0.10
Nodes (20): executor, options, outputs, name, options, command, cwd, packageRoot (+12 more)

### Community 16 - "Root TS Config"
Cohesion: 0.12
Nodes (16): compilerOptions, forceConsistentCasingInFileNames, importHelpers, module, moduleResolution, noFallthroughCasesInSwitch, noImplicitOverride, noImplicitReturns (+8 more)

### Community 17 - "App TS Config"
Cohesion: 0.12
Nodes (16): compilerOptions, forceConsistentCasingInFileNames, importHelpers, module, moduleResolution, noFallthroughCasesInSwitch, noImplicitOverride, noImplicitReturns (+8 more)

### Community 18 - "Plugin Package Config"
Cohesion: 0.12
Nodes (16): description, devDependencies, tsup, typescript, main, module, name, peerDependencies (+8 more)

### Community 19 - "Library TS Compiler Options"
Cohesion: 0.13
Nodes (14): compilerOptions, forceConsistentCasingInFileNames, importHelpers, module, noFallthroughCasesInSwitch, noImplicitOverride, noImplicitReturns, noPropertyAccessFromIndexSignature (+6 more)

### Community 20 - "Library TS Compiler Options"
Cohesion: 0.13
Nodes (14): compilerOptions, forceConsistentCasingInFileNames, importHelpers, module, noFallthroughCasesInSwitch, noImplicitOverride, noImplicitReturns, noPropertyAccessFromIndexSignature (+6 more)

### Community 21 - "Library TS Compiler Options"
Cohesion: 0.13
Nodes (14): compilerOptions, forceConsistentCasingInFileNames, importHelpers, module, noFallthroughCasesInSwitch, noImplicitOverride, noImplicitReturns, noPropertyAccessFromIndexSignature (+6 more)

### Community 22 - "Docs Package Metadata"
Cohesion: 0.14
Nodes (12): bugs, url, description, files, homepage, keywords, license, main (+4 more)

### Community 23 - "Package Metadata"
Cohesion: 0.15
Nodes (12): bugs, url, description, files, homepage, keywords, license, main (+4 more)

### Community 24 - "Date Transformation"
Cohesion: 0.22
Nodes (11): dateType, BASE_PATH token, dateTransformRegex, enableDateTransform, provideNgOpenapi, DateInterceptor, ISO_DATE_REGEX, transformDates (+3 more)

### Community 25 - "Plugins Changelog"
Cohesion: 0.22
Nodes (11): validation, httpResource API, HttpResourcePlugin, plugins, ZodPlugin, @ng-openapi/http-resource changelog, Changelog, Conventional Commits (+3 more)

### Community 26 - "Nx Workspace Config"
Cohesion: 0.18
Nodes (10): analytics, defaultBase, extends, nxCloudId, plugins, release, version, $schema (+2 more)

### Community 27 - "Local Registry Target"
Cohesion: 0.20
Nodes (9): executor, options, name, config, port, storage, $schema, targets (+1 more)

### Community 28 - "Root Package Manifest"
Cohesion: 0.22
Nodes (8): license, name, nx, includedScripts, private, type, version, workspaces

### Community 29 - "Peer Dependencies"
Cohesion: 0.22
Nodes (9): optional, optional, optional, peerDependenciesMeta, @angular/common, @angular/core, ng-openapi, ts-morph (+1 more)

### Community 30 - "Package Manifest"
Cohesion: 0.22
Nodes (8): description, main, module, name, private, type, types, version

### Community 31 - "Runtime Dependencies"
Cohesion: 0.29
Nodes (7): dependencies, commander, js-yaml, ts-morph, ts-node, @types/swagger-schema-official, typescript

### Community 32 - "Library TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, types, extends, include

### Community 33 - "Library TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, types, extends, include

### Community 34 - "Library TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, types, extends, include

### Community 35 - "Library TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, types, extends, include

### Community 36 - "Library TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, types, extends, include

### Community 37 - "Nx Project Definition"
Cohesion: 0.33
Nodes (5): name, projectType, $schema, sourceRoot, tags

### Community 38 - "Nx Project Definition"
Cohesion: 0.33
Nodes (5): name, projectType, $schema, sourceRoot, tags

### Community 39 - "Nx Project Definition"
Cohesion: 0.33
Nodes (5): name, projectType, $schema, sourceRoot, tags

### Community 41 - "Optional Peer Deps"
Cohesion: 0.40
Nodes (5): optional, optional, peerDependenciesMeta, @angular/common, @angular/core

### Community 42 - "Angular Peer Deps"
Cohesion: 0.40
Nodes (5): peerDependencies, @angular/common, @angular/core, ng-openapi, ts-morph

### Community 43 - "Brand Identity & Logo"
Cohesion: 0.67
Nodes (4): ng-openapi Brand Identity, Green Lime Gradient Palette, ng-openapi Logo, Dynamic Swoosh / Checkmark Motif

### Community 44 - "Author Metadata"
Cohesion: 0.50
Nodes (4): author, email, name, url

### Community 45 - "Repository Metadata"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 47 - "Author Metadata"
Cohesion: 0.50
Nodes (4): author, email, name, url

### Community 48 - "Export Map"
Cohesion: 0.50
Nodes (4): exports, import, require, types

### Community 49 - "Repository Metadata"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 50 - "Enum Generation Options"
Cohesion: 0.67
Nodes (3): enumStyle, EnumValueObject, generateEnumBasedOnDescription

### Community 51 - "Nx Named Inputs"
Cohesion: 0.67
Nodes (3): namedInputs, default, sharedGlobals

### Community 52 - "Node Engines"
Cohesion: 0.67
Nodes (3): engines, node, npm

### Community 53 - "Funding Metadata"
Cohesion: 0.67
Nodes (3): funding, type, url

### Community 54 - "Angular Peer Deps"
Cohesion: 0.67
Nodes (3): peerDependencies, @angular/common, @angular/core

### Community 55 - "Publish Config"
Cohesion: 0.67
Nodes (3): publishConfig, access, registry

### Community 56 - "Publish Scripts"
Cohesion: 0.67
Nodes (3): scripts, build, prepublishOnly

### Community 57 - "Node Engines"
Cohesion: 0.67
Nodes (3): engines, node, npm

### Community 58 - "Funding Metadata"
Cohesion: 0.67
Nodes (3): funding, type, url

### Community 59 - "Publish Config"
Cohesion: 0.67
Nodes (3): publishConfig, access, registry

### Community 60 - "Publish Scripts"
Cohesion: 0.67
Nodes (3): scripts, build, prepublishOnly

## Knowledge Gaps
- **435 isolated node(s):** `name`, `$schema`, `sourceRoot`, `projectType`, `tags` (+430 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GeneratorConfig` connect `Core Generation Pipeline` to `Service Method Generators`, `Method Body Generation`, `Zod Schema Generation`, `Type Resolution & Params`, `Swagger Type Generation`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `PathInfo` connect `Method Body Generation` to `Core Generation Pipeline`, `Service Method Generators`, `Zod Schema Generation`, `Type Resolution & Params`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `SwaggerParser` connect `Core Generation Pipeline` to `Service Method Generators`, `Method Body Generation`, `Zod Schema Generation`, `Type Resolution & Params`, `Swagger Type Generation`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `name`, `$schema`, `sourceRoot` to the rest of the system?**
  _436 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Generation Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.052614052614052616 - nodes in this community are weakly interconnected._
- **Should `Service Method Generators` be split into smaller, more focused modules?**
  _Cohesion score 0.06436487638533675 - nodes in this community are weakly interconnected._
- **Should `Method Body Generation` be split into smaller, more focused modules?**
  _Cohesion score 0.09195402298850575 - nodes in this community are weakly interconnected._