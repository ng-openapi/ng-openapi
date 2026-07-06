import type { DecoratorStructure, OptionalKind } from "ts-morph";

export interface ServiceDecoratorEmitOptions {
    /** Class decorator flavor from GeneratorConfig; "service" requires Angular 22+. */
    serviceDecorator?: "injectable" | "service";
}

/** The class decorator plus the @angular/core import it needs. */
export interface ServiceDecoratorEmit {
    decorator: OptionalKind<DecoratorStructure>;
    namedImport: "Injectable" | "Service";
}

/**
 * Emits the DI decorator for generated root-provided service/resource classes:
 * Angular 22+'s `@Service()` when opted in, otherwise
 * `@Injectable({ providedIn: "root" })`.
 *
 * `@Service()` is shorthand for exactly `providedIn: "root"` — it cannot
 * express the other @Injectable options (useClass/useValue/useFactory/…), so
 * this helper must only ever back classes that are plain root singletons.
 * Manually-provided classes (interceptors) keep their bare `@Injectable()`.
 */
export function emitServiceDecorator(options: ServiceDecoratorEmitOptions): ServiceDecoratorEmit {
    if (options.serviceDecorator === "service") {
        return { decorator: { name: "Service", arguments: [] }, namedImport: "Service" };
    }
    return { decorator: { name: "Injectable", arguments: ['{ providedIn: "root" }'] }, namedImport: "Injectable" };
}
