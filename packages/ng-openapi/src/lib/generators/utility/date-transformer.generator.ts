import { Project, Scope, VariableDeclarationKind } from "ts-morph";
import * as path from "path";

export class DateTransformerGenerator {
    private project: Project;

    constructor(project: Project) {
        this.project = project;
    }

    generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "date-transformer.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.addImportDeclarations([
            {
                namedImports: [
                    "HttpEvent",
                    "HttpHandler",
                    "HttpInterceptor",
                    "HttpInterceptorFn",
                    "HttpRequest",
                    "HttpResponse",
                ],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: ["Injectable"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: ["Observable", "map"],
                moduleSpecifier: "rxjs",
            },
        ]);

        // Add ISO date regex constant.
        // Matches a full RFC 3339 / ISO 8601 date-time: optional fractional seconds
        // of any length and an optional 'Z' or numeric timezone offset (±hh:mm or
        // ±hhmm).
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: "ISO_DATE_REGEX",
                    initializer: "/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:?\\d{2})?$/",
                },
            ],
        });

        // Add transformer function
        sourceFile.addFunction({
            name: "transformDates",
            isExported: true,
            parameters: [
                { name: "obj", type: "any" },
                { name: "dateRegex", type: "RegExp", initializer: "ISO_DATE_REGEX" },
            ],
            returnType: "any",
            statements: `
    if (obj === null || obj === undefined || typeof obj !== 'object') {
        return obj;
    }

    if (obj instanceof Date) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => transformDates(item, dateRegex));
    }

    if (typeof obj === 'object') {
        const transformed: any = {};
        for (const key of Object.keys(obj)) {
            const value = obj[key];
            if (typeof value === 'string' && dateRegex.test(value)) {
                transformed[key] = new Date(value);
            } else {
                transformed[key] = transformDates(value, dateRegex);
            }
        }
        return transformed;
    }

    return obj;`,
        });

        // Add shared response transform used by both interceptor variants
        sourceFile.addFunction({
            name: "transformDateResponse",
            parameters: [
                { name: "event", type: "HttpEvent<any>" },
                { name: "dateRegex", type: "RegExp" },
            ],
            returnType: "HttpEvent<any>",
            statements: `
    if (event instanceof HttpResponse && event.body) {
        return event.clone({ body: transformDates(event.body, dateRegex) });
    }
    return event;`,
        });

        // Add functional interceptor factory + default instance
        sourceFile.addFunction({
            name: "dateInterceptorWithRegex",
            isExported: true,
            docs: [
                "Builds a functional date interceptor for `provideHttpClient(withInterceptors([...]))`.\n@param dateRegex Optional override for the pattern used to detect ISO date strings.",
            ],
            parameters: [{ name: "dateRegex", type: "RegExp", initializer: "ISO_DATE_REGEX" }],
            returnType: "HttpInterceptorFn",
            statements: `
    return (req, next) => next(req).pipe(map((event) => transformDateResponse(event, dateRegex)));`,
        });

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: "dateInterceptor",
                    type: "HttpInterceptorFn",
                    initializer: "dateInterceptorWithRegex()",
                },
            ],
            leadingTrivia: `/**
 * Functional date interceptor using the default ISO_DATE_REGEX.
 * Use dateInterceptorWithRegex(...) to customize the pattern.
 */\n`,
        });

        // Add interceptor class
        sourceFile.addClass({
            name: "DateInterceptor",
            isExported: true,
            decorators: [
                {
                    name: "Injectable",
                    arguments: [],
                },
            ],
            implements: ["HttpInterceptor"],
            ctors: [
                {
                    docs: [
                        "@param dateRegex Optional override for the pattern used to detect ISO date strings.",
                    ],
                    parameters: [
                        {
                            name: "dateRegex",
                            type: "RegExp",
                            scope: Scope.Private,
                            isReadonly: true,
                            initializer: "ISO_DATE_REGEX",
                        },
                    ],
                },
            ],
            methods: [
                {
                    name: "intercept",
                    parameters: [
                        { name: "req", type: "HttpRequest<any>" },
                        { name: "next", type: "HttpHandler" },
                    ],
                    returnType: "Observable<HttpEvent<any>>",
                    statements: `
    return next.handle(req).pipe(map((event) => transformDateResponse(event, this.dateRegex)));`,
                },
            ],
        });

        sourceFile.formatText();
        sourceFile.saveSync();
    }
}
