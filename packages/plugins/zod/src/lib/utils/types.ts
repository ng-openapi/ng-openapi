export interface ZodPluginOptions {
    strict?:
        | boolean
        | {
        param?: boolean;
        query?: boolean;
        header?: boolean;
        body?: boolean;
        response?: boolean;
    };
    coerce?:
        | boolean
        | {
        param?: boolean;
        query?: boolean;
        header?: boolean;
        body?: boolean;
        response?: boolean;
    };
    generate?: {
        param?: boolean;
        query?: boolean;
        header?: boolean;
        body?: boolean;
        response?: boolean;
    };
    dateTime?: {
        offset?: boolean;
        local?: boolean;
        precision?: number;
    };
    time?: {
        precision?: -1 | 0 | 1 | 2 | 3;
    };
}

export interface BuildOptions {
    required?: boolean;
    coerce?: boolean;
    strict?: boolean;
    removeReadOnly?: boolean;
}
