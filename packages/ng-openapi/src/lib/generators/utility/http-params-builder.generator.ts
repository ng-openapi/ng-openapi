import * as path from "path";
import { ClassDeclaration, MethodDeclarationStructure, OptionalKind, Project, Scope } from "ts-morph";

export class HttpParamsBuilderGenerator {
    private project: Project;

    constructor(project: Project) {
        this.project = project;
    }

    generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "http-params-builder.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.addImportDeclaration({
            namedImports: ["HttpParams"],
            moduleSpecifier: "@angular/common/http",
        });

        const classDeclaration = sourceFile.addClass({
            name: "HttpParamsBuilder",
            isExported: true,
        });

        this.addMethods(classDeclaration);

        sourceFile.formatText();
        sourceFile.saveSync();
    }

    private addMethods(classDeclaration: ClassDeclaration): void {
        const methods: OptionalKind<MethodDeclarationStructure>[] = [
            {
                name: "addToHttpParams",
                isStatic: true,
                scope: Scope.Public,
                parameters: [
                    { name: "httpParams", type: "HttpParams" },
                    { name: "value", type: "any" },
                    { name: "key", type: "string", hasQuestionToken: true },
                ],
                returnType: "HttpParams",
                docs: ["Adds a value to HttpParams. Delegates to recursive handler for objects/arrays."],
                statements: `const isDate = value instanceof Date;
const isObject = typeof value === "object" && !isDate;

if (isObject) {
    return this.addToHttpParamsRecursive(httpParams, value);
}

return this.addToHttpParamsRecursive(httpParams, value, key);`,
            },
            {
                name: "addToHttpParamsRecursive",
                isStatic: true,
                scope: Scope.Private,
                parameters: [
                    { name: "httpParams", type: "HttpParams" },
                    { name: "value", type: "any", hasQuestionToken: true },
                    { name: "key", type: "string", hasQuestionToken: true },
                ],
                returnType: "HttpParams",
                statements: `if (value == null) {
    return httpParams;
}

if (Array.isArray(value)) {
    return this.handleArray(httpParams, value, key);
}

if (value instanceof Date) {
    return this.handleDate(httpParams, value, key);
}

if (typeof value === "object") {
    return this.handleObject(httpParams, value, key);
}

return this.handlePrimitive(httpParams, value, key);`,
            },
            {
                name: "handleArray",
                isStatic: true,
                scope: Scope.Private,
                parameters: [
                    { name: "httpParams", type: "HttpParams" },
                    { name: "arr", type: "unknown[]" },
                    { name: "key", type: "string", hasQuestionToken: true },
                ],
                returnType: "HttpParams",
                statements: `arr.forEach((element) => {
    httpParams = this.addToHttpParamsRecursive(httpParams, element, key);
});
return httpParams;`,
            },
            {
                name: "handleDate",
                isStatic: true,
                scope: Scope.Private,
                parameters: [
                    { name: "httpParams", type: "HttpParams" },
                    { name: "date", type: "Date" },
                    { name: "key", type: "string", hasQuestionToken: true },
                ],
                returnType: "HttpParams",
                statements: `if (!key) {
    throw new Error("key may not be null if value is Date");
}
return httpParams.append(key, date.toISOString().substring(0, 10));`,
            },
            {
                name: "handleObject",
                isStatic: true,
                scope: Scope.Private,
                parameters: [
                    { name: "httpParams", type: "HttpParams" },
                    { name: "obj", type: "Record<string, any>" },
                    { name: "key", type: "string", hasQuestionToken: true },
                ],
                returnType: "HttpParams",
                statements: `Object.keys(obj).forEach((prop) => {
    const nestedKey = key ? \`\${key}.\${prop}\` : prop;
    httpParams = this.addToHttpParamsRecursive(httpParams, obj[prop], nestedKey);
});
return httpParams;`,
            },
            {
                name: "handlePrimitive",
                isStatic: true,
                scope: Scope.Private,
                parameters: [
                    { name: "httpParams", type: "HttpParams" },
                    { name: "value", type: "string | number | boolean" },
                    { name: "key", type: "string", hasQuestionToken: true },
                ],
                returnType: "HttpParams",
                statements: `if (!key) {
    throw new Error("key may not be null if value is primitive");
}
return httpParams.append(key, value);`,
            },
        ];

        classDeclaration.addMethods(methods);
    }
}
