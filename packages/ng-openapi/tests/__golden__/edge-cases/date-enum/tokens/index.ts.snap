import { InjectionToken } from "@angular/core";
import { HttpInterceptor, HttpContextToken } from "@angular/common/http";

/**
 * Injection token for the default client base API path
 */
export const BASE_PATH_DEFAULT = new InjectionToken<string>('BASE_PATH_DEFAULT', {
    providedIn: 'root',
    factory: () => '/api', // Default fallback
});
/**
 * Injection token for the default client HTTP interceptor instances
 */
export const HTTP_INTERCEPTORS_DEFAULT = new InjectionToken<HttpInterceptor[]>('HTTP_INTERCEPTORS_DEFAULT', {
    providedIn: 'root',
    factory: () => [], // Default empty array
});
/**
 * HttpContext token to identify requests belonging to the default client
 */
export const CLIENT_CONTEXT_TOKEN_DEFAULT = new HttpContextToken<string>(() => 'default');
/**
 * @deprecated Use BASE_PATH_DEFAULT instead
 */
export const BASE_PATH = BASE_PATH_DEFAULT;
/**
 * @deprecated Use CLIENT_CONTEXT_TOKEN_DEFAULT instead
 */
export const CLIENT_CONTEXT_TOKEN = CLIENT_CONTEXT_TOKEN_DEFAULT;
