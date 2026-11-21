import type { NormalizedResponseSequence } from "../model/operation.model";
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
