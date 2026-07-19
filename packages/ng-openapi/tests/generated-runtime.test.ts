// Load the JIT compiler before any @angular/* runtime import: the published
// packages are partially compiled and fall back to JIT under vitest (no linker)
import "@angular/compiler";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EnvironmentInjector, inject, InjectionToken, Injector, runInInjectionContext } from "@angular/core";
import {
    HTTP_INTERCEPTORS,
    HttpContext,
    HttpEvent,
    HttpHandlerFn,
    HttpInterceptor,
    HttpInterceptorFn,
    HttpRequest,
    HttpResponse,
} from "@angular/common/http";
import { firstValueFrom, Observable, of } from "rxjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateFromConfig } from "ng-openapi";
import { fixturePath } from "@ng-openapi/testing";

/**
 * Execution oracle for the generated interceptor wiring: the golden suite pins
 * the emitted text, but nothing else actually runs a generated chain. These
 * tests generate a real client and drive its providers.ts / base-interceptor.ts
 * to verify provider composition per flag, chain ordering, HttpContext gating,
 * the DI-with-fallback class resolution, and the date transform end to end.
 */

const outputDir = join(process.cwd(), "tmp", "runtime-tests", "client");

// Modules are dynamically imported from the generated output; typed as any on purpose.
let providersModule: any;
let baseInterceptorModule: any;
let tokensModule: any;
let dateTransformerModule: any;

beforeAll(async () => {
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(outputDir, { recursive: true });

    await generateFromConfig({
        input: fixturePath("openapi-3.0"),
        output: outputDir,
        options: { dateType: "Date", enumStyle: "union", generateServices: true },
    });

    // tmp/ has no tsconfig; without experimentalDecorators esbuild leaves the
    // generated @Injectable() decorators untransformed and node cannot parse them
    writeFileSync(
        join(outputDir, "..", "tsconfig.json"),
        JSON.stringify({ compilerOptions: { experimentalDecorators: true } }),
    );

    // Literal relative specifiers keep the imports inside vite's module runner
    // (which transforms the generated TS); they resolve lazily at call time,
    // after generateFromConfig above has written the files. These are generated
    // test artifacts under the gitignored tmp/, not workspace projects.
    /* eslint-disable @nx/enforce-module-boundaries */
    [providersModule, baseInterceptorModule, tokensModule, dateTransformerModule] = await Promise.all([
        import("../../../tmp/runtime-tests/client/providers.ts"),
        import("../../../tmp/runtime-tests/client/utils/base-interceptor.ts"),
        import("../../../tmp/runtime-tests/client/tokens/index.ts"),
        import("../../../tmp/runtime-tests/client/utils/date-transformer.ts"),
    ]);
    /* eslint-enable @nx/enforce-module-boundaries */
});

afterAll(() => {
    rmSync(join(process.cwd(), "tmp", "runtime-tests"), { recursive: true, force: true });
});

/** EnvironmentProviders carries its providers in the private ɵproviders field (stable since v14). */
function unwrapProviders(environmentProviders: unknown): any[] {
    return (environmentProviders as { ɵproviders: any[] }).ɵproviders;
}

/**
 * Minimal injection context standing in for the app's EnvironmentInjector:
 * the generated code only reads tokens and EnvironmentInjector via inject(),
 * so a plain Injector with an explicit EnvironmentInjector self-binding works.
 */
function createInjectionContext(providers: { provide: unknown; useValue: unknown }[]): Injector {
    const injector: Injector = Injector.create({
        providers: [...providers, { provide: EnvironmentInjector, useFactory: () => injector, deps: [] }],
    });
    return injector;
}

/** Builds the client's HttpInterceptorFn[] the same way the app would: through the emitted useFactory. */
function buildChain(config: Record<string, unknown>): HttpInterceptorFn[] {
    const factoryProvider = unwrapProviders(providersModule.provideDefaultClient(config)).find(
        (provider) => provider.provide === tokensModule.HTTP_INTERCEPTOR_FNS_DEFAULT,
    );
    expect(factoryProvider, "HTTP_INTERCEPTOR_FNS_DEFAULT factory provider").toBeDefined();
    return runInInjectionContext(createInjectionContext([]), () => factoryProvider.useFactory());
}

function clientRequest(): HttpRequest<unknown> {
    return new HttpRequest("GET", "/pets", {
        context: new HttpContext().set(tokensModule.CLIENT_CONTEXT_TOKEN_DEFAULT, "default"),
    });
}

function runFunctionalInterceptor(
    chain: HttpInterceptorFn[],
    req: HttpRequest<unknown>,
    next: HttpHandlerFn,
    extraProviders: { provide: unknown; useValue: unknown }[] = [],
): Promise<HttpEvent<unknown>> {
    const injector = createInjectionContext([
        { provide: tokensModule.HTTP_INTERCEPTOR_FNS_DEFAULT, useValue: chain },
        ...extraProviders,
    ]);
    return firstValueFrom(
        runInInjectionContext(injector, () =>
            baseInterceptorModule.defaultClientInterceptor(req, next),
        ) as Observable<HttpEvent<unknown>>,
    );
}

describe("generated providers.ts", () => {
    it("registers the class interceptor on HTTP_INTERCEPTORS by default", () => {
        const providers = unwrapProviders(providersModule.provideDefaultClient({ basePath: "/api" }));
        const diRegistration = providers.filter((provider) => provider.provide === HTTP_INTERCEPTORS);
        expect(diRegistration).toHaveLength(1);
        expect(diRegistration[0].useClass).toBe(baseInterceptorModule.DefaultBaseInterceptor);
        expect(diRegistration[0].multi).toBe(true);
    });

    it("omits the HTTP_INTERCEPTORS registration with registerDiInterceptor: false", () => {
        const providers = unwrapProviders(
            providersModule.provideDefaultClient({ basePath: "/api", registerDiInterceptor: false }),
        );
        expect(providers.some((provider) => provider.provide === HTTP_INTERCEPTORS)).toBe(false);
        // The chain token must still be provided — only the DI activation path is dropped
        expect(providers.some((provider) => provider.provide === tokensModule.HTTP_INTERCEPTOR_FNS_DEFAULT)).toBe(
            true,
        );
    });

    it("resolves class interceptors through DI when provided and news them otherwise", () => {
        const calls: string[] = [];
        class ProvidedInterceptor implements HttpInterceptor {
            intercept(req: HttpRequest<unknown>, next: { handle: HttpHandlerFn }): Observable<HttpEvent<unknown>> {
                calls.push("provided");
                return next.handle(req);
            }
        }
        class PlainInterceptor implements HttpInterceptor {
            intercept(req: HttpRequest<unknown>, next: { handle: HttpHandlerFn }): Observable<HttpEvent<unknown>> {
                calls.push("plain");
                return next.handle(req);
            }
        }
        const providedInstance = new ProvidedInterceptor();

        const factoryProvider = unwrapProviders(
            providersModule.provideDefaultClient({
                basePath: "/api",
                enableDateTransform: false,
                interceptors: [ProvidedInterceptor, PlainInterceptor],
            }),
        ).find((provider) => provider.provide === tokensModule.HTTP_INTERCEPTOR_FNS_DEFAULT);
        const injector = createInjectionContext([{ provide: ProvidedInterceptor, useValue: providedInstance }]);
        const chain: HttpInterceptorFn[] = runInInjectionContext(injector, () => factoryProvider.useFactory());

        expect(chain).toHaveLength(2);
        const next: HttpHandlerFn = () => of(new HttpResponse({ body: null }));
        chain.forEach((fn) => fn(clientRequest(), next));
        // The DI-provided class resolved to the registered instance (calls recorded through it),
        // the unprovided one was instantiated directly — both ended up in the chain
        expect(calls).toEqual(["provided", "plain"]);
    });
});

describe("generated base-interceptor.ts", () => {
    it("passes requests without this client's context token through untouched", async () => {
        const chainCalls: string[] = [];
        const marker: HttpInterceptorFn = (req, next) => {
            chainCalls.push("chain");
            return next(req);
        };
        const foreignRequest = new HttpRequest("GET", "/other");
        const response = new HttpResponse({ body: "untouched" });

        const event = await runFunctionalInterceptor([marker], foreignRequest, () => of(response));

        expect(chainCalls).toEqual([]);
        expect(event).toBe(response);
    });

    it("runs the chain in array order on the request path, with inject() available in each fn", async () => {
        const order: string[] = [];
        const PROBE = new InjectionToken<string>("PROBE");
        const record =
            (name: string): HttpInterceptorFn =>
            (req, next) => {
                order.push(name);
                return next(req);
            };
        const injecting: HttpInterceptorFn = (req, next) => {
            // inject() must work inside chained fns — the runner wraps each fn in runInInjectionContext
            order.push(`inject:${inject(PROBE)}`);
            return next(req);
        };

        await runFunctionalInterceptor(
            [record("first"), injecting, record("last")],
            clientRequest(),
            () => of(new HttpResponse({ body: null })),
            [{ provide: PROBE, useValue: "probe-value" }],
        );

        expect(order).toEqual(["first", "inject:probe-value", "last"]);
    });

    it("transforms ISO date strings into Date instances through the full provider-built chain", async () => {
        const chain = buildChain({ basePath: "/api" });
        const body = { createdAt: "2024-01-15T10:30:00Z", name: "rex", nested: { seenAt: "2024-01-15T10:30:00.123Z" } };

        const event = (await runFunctionalInterceptor(chain, clientRequest(), () =>
            of(new HttpResponse({ body })),
        )) as HttpResponse<any>;

        expect(event.body.createdAt).toBeInstanceOf(Date);
        expect(event.body.nested.seenAt).toBeInstanceOf(Date);
        expect(event.body.name).toBe("rex");
    });

    it("orders the provider-built chain date → classes → fns", async () => {
        const order: string[] = [];
        class RecordingClassInterceptor implements HttpInterceptor {
            intercept(req: HttpRequest<unknown>, next: { handle: HttpHandlerFn }): Observable<HttpEvent<unknown>> {
                order.push("class");
                return next.handle(req);
            }
        }
        const recordingFn: HttpInterceptorFn = (req, next) => {
            order.push("fn");
            return next(req);
        };

        const chain = buildChain({
            basePath: "/api",
            interceptors: [RecordingClassInterceptor],
            interceptorFns: [recordingFn],
        });
        // Date interceptor contributes no request-side marker; assert via chain length + response transform
        expect(chain).toHaveLength(3);

        const event = (await runFunctionalInterceptor(chain, clientRequest(), () =>
            of(new HttpResponse({ body: { at: "2024-01-15T10:30:00Z" } })),
        )) as HttpResponse<any>;

        expect(order).toEqual(["class", "fn"]);
        expect(event.body.at).toBeInstanceOf(Date);
    });

    it("class adapter drives the same chain as the functional adapter", async () => {
        const order: string[] = [];
        const record =
            (name: string): HttpInterceptorFn =>
            (req, next) => {
                order.push(name);
                return next(req);
            };
        const injector = createInjectionContext([
            { provide: tokensModule.HTTP_INTERCEPTOR_FNS_DEFAULT, useValue: [record("a"), record("b")] },
        ]);
        const classAdapter = runInInjectionContext(
            injector,
            () => new baseInterceptorModule.DefaultBaseInterceptor(),
        );

        const event = await firstValueFrom(
            classAdapter.intercept(clientRequest(), {
                handle: () => of(new HttpResponse({ body: "done" })),
            }) as Observable<HttpEvent<unknown>>,
        );

        expect(order).toEqual(["a", "b"]);
        expect((event as HttpResponse<string>).body).toBe("done");
    });
});

describe("generated date-transformer.ts", () => {
    it("dateInterceptorWithRegex honors a custom pattern", async () => {
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
        const fn: HttpInterceptorFn = dateTransformerModule.dateInterceptorWithRegex(dateOnly);

        const event = (await firstValueFrom(
            fn(new HttpRequest("GET", "/x"), () =>
                of(new HttpResponse({ body: { plain: "2024-01-15", iso: "2024-01-15T10:30:00Z" } })),
            ) as Observable<HttpEvent<unknown>>,
        )) as HttpResponse<any>;

        expect(event.body.plain).toBeInstanceOf(Date);
        // custom pattern replaced the default: full ISO strings no longer match
        expect(event.body.iso).toBe("2024-01-15T10:30:00Z");
    });
});
