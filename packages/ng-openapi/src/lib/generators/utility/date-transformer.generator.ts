import { Project, VariableDeclarationKind } from "ts-morph";
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
                namedImports: ["HttpEvent", "HttpHandler", "HttpInterceptor", "HttpRequest", "HttpResponse"],
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

        // Add ISO date regex constant
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: "ISO_DATE_REGEX",
                    initializer: "/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z?$/",
                },
            ],
        });

        // Add transformer function
        sourceFile.addFunction({
            name: "transformDates",
            isExported: true,
            parameters: [{ name: "obj", type: "unknown" }],
            returnType: "unknown",
            statements: `
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (obj instanceof Date) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => transformDates(item));
    }
    
    const transformed: { [key: string]: unknown } = {};
    for (const key of Object.keys(obj)) {
        const value = (obj as Record<string, unknown>)[key];
        if (typeof value === 'string' && ISO_DATE_REGEX.test(value)) {
            transformed[key] = new Date(value);
        } else {
            transformed[key] = transformDates(value);
        }
    }
    return transformed;`,
        });

        // Add interceptor class
        sourceFile.addClass({
            name: "DateInterceptor",
            isExported: true,
            decorators: [ { name: "Injectable", arguments: [], }, ],
            implements: ["HttpInterceptor"],
            methods: [
                {
                    name: "intercept",
                    parameters: [
                        { name: "req", type: "HttpRequest<unknown>" },
                        { name: "next", type: "HttpHandler" },
                    ],
                    returnType: "Observable<HttpEvent<unknown>>",
                    statements: `
    return next.handle(req).pipe(
        map(event => {
            if (event instanceof HttpResponse && event.body) {
                return event.clone({ body: transformDates(event.body) });
            }
            return event;
        })
    );`,
                },
            ],
        });

        sourceFile.formatText();
        sourceFile.saveSync();
    }
}
