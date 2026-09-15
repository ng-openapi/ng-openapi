import { HttpParams } from "@angular/common/http";

export class HttpParamsBuilder {
    /** Adds a value to HttpParams. Delegates to recursive handler for objects/arrays. */
    public static addToHttpParams(httpParams: HttpParams, value: any, key?: string): HttpParams {
        const isDate = value instanceof Date;
        const isArray = Array.isArray(value);
        const isObject = typeof value === "object" && !isDate && !isArray;

        if (isObject) {
            return this.addToHttpParamsRecursive(httpParams, value);
        }

        return this.addToHttpParamsRecursive(httpParams, value, key);
    }

    private static addToHttpParamsRecursive(httpParams: HttpParams, value?: any, key?: string): HttpParams {
        if (value == null) {
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

        return this.handlePrimitive(httpParams, value, key);
    }

    private static handleArray(httpParams: HttpParams, arr: unknown[], key?: string): HttpParams {
        arr.forEach((element) => {
            httpParams = this.addToHttpParamsRecursive(httpParams, element, key);
        });
        return httpParams;
    }

    private static handleDate(httpParams: HttpParams, date: Date, key?: string): HttpParams {
        if (!key) {
            throw new Error("key may not be null if value is Date");
        }
        return httpParams.append(key, date.toISOString());
    }

    private static handleObject(httpParams: HttpParams, obj: Record<string, any>, key?: string): HttpParams {
        Object.keys(obj).forEach((prop) => {
            const nestedKey = key ? `${key}.${prop}` : prop;
            httpParams = this.addToHttpParamsRecursive(httpParams, obj[prop], nestedKey);
        });
        return httpParams;
    }

    private static handlePrimitive(httpParams: HttpParams, value: string | number | boolean, key?: string): HttpParams {
        if (!key) {
            throw new Error("key may not be null if value is primitive");
        }
        return httpParams.append(key, value);
    }
}
