import type { NormalizedOperation, NormalizedResponseSequence } from "../model/operation.model";
import type { TypeMappingConfig } from "../types/config.types";
import type { SequenceFormat } from "../utils/functions/media-types";
import { getTypeScriptType } from "../utils/type.utils";

/**
 * The readers of the generated `utils/http-stream.ts`, by format. Both
 * clients name them here, so the generated helper and its call sites cannot
 * drift apart on a name.
 */
const SEQUENCE_READERS: Record<SequenceFormat, { stream: string; parse: string }> = {
    "json-lines": { stream: "streamJsonLines", parse: "parseJsonLines" },
    "json-seq": { stream: "streamJsonSequence", parse: "parseJsonSequence" },
    "event-stream": { stream: "streamServerSentEvents", parse: "parseServerSentEvents" },
};

/** The RxJS operator that emits the items of a streamed response as they arrive. */
export function emitSequenceStreamOperator(format: SequenceFormat, itemType: string): string {
    return `${SEQUENCE_READERS[format].stream}<${itemType}>()`;
}

/** The function that splits the text of a response that has ended into its items. */
export function emitSequenceParser(format: SequenceFormat): string {
    return SEQUENCE_READERS[format].parse;
}

/**
 * TS type of one item of a streamed response, or undefined when the response
 * is not a stream: it is no sequence at all, or one declared complete.
 */
export function getStreamItemType(
    sequence: NormalizedResponseSequence | undefined,
    config: TypeMappingConfig,
): string | undefined {
    const itemSchema = sequence?.itemSchema;
    return itemSchema ? getTypeScriptType(itemSchema, config, itemSchema.nullable) : undefined;
}

/**
 * The class members through which the items of a sequential response get
 * their dates converted. Both clients add them, to a class that needs them.
 */
export interface DateReviverEmit {
    /** The property that holds this client's date interceptor, when one is provided. */
    propertyName: string;
    propertyInitializer: string;
    /** The method the items are passed through. */
    methodName: string;
    methodDocs: string;
    methodStatements: string;
}

/**
 * Whether the items of an operation's response have to go through the date
 * conversion in the class that reads them.
 *
 * With `dateType: "Date"` the models type `date-time` fields as `Date`, and
 * the generated `DateInterceptor` makes that true by converting the body of
 * every JSON response. A sequential response is not one: the interceptor sees
 * it as text, and its items are parsed afterwards, in the service. Without
 * this they would carry the strings the server sent under a type that says
 * `Date`.
 *
 * Not for Server-Sent Events: an event's fields are strings by definition,
 * and a `data` that happens to look like a date is still the text sent.
 */
export function revivesDates(
    operation: Pick<NormalizedOperation, "responseSequence">,
    config: { options: { dateType: "string" | "Date" } },
): boolean {
    const sequence = operation.responseSequence;
    return config.options.dateType === "Date" && sequence !== undefined && sequence.format !== "event-stream";
}

/**
 * The members themselves. The interceptor is looked up among this client's
 * interceptors rather than constructed, so the conversion the items get is
 * the one the rest of the client gets: the pattern passed to the provider,
 * and none at all with `enableDateTransform: false`.
 */
export function emitDateReviver(interceptorsTokenName: string): DateReviverEmit {
    return {
        propertyName: "dateInterceptor",
        propertyInitializer:
            `inject(${interceptorsTokenName}, { optional: true })` +
            "?.find((interceptor): interceptor is DateInterceptor => interceptor instanceof DateInterceptor)",
        methodName: "reviveDates",
        methodDocs:
            "Applies this client's date conversion to the items of a sequential response: they are parsed " +
            "from text, after the date interceptor has seen the response.",
        methodStatements: "return this.dateInterceptor ? this.dateInterceptor.transform(value) : value;",
    };
}
