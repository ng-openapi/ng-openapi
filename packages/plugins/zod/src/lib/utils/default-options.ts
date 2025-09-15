import { ZodPluginOptions } from "./types";

export const DEFAULT_OPTIONS: ZodPluginOptions = {
    strict: false,
    coerce: false,
    generate: {
        param: true,
        query: true,
        header: false,
        body: true,
        response: true,
    },
};