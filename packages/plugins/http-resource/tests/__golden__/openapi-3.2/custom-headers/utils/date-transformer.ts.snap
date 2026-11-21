import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, map } from "rxjs";

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

export function transformDates(obj: any, dateRegex: RegExp = ISO_DATE_REGEX): any {

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

    return obj;
}

@Injectable()
export class DateInterceptor implements HttpInterceptor {
    /** @param dateRegex Optional override for the pattern used to detect ISO date strings. */
    constructor(private readonly dateRegex: RegExp = ISO_DATE_REGEX) {
    }

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {

        return next.handle(req).pipe(
            map(event => {
                if (event instanceof HttpResponse && event.body) {
                    return event.clone({ body: transformDates(event.body, this.dateRegex) });
                }
                return event;
            })
        );
    }
}
