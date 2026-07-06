import * as fs from "fs";
import { isUrl } from "../utils/functions/is-url";
import { SpecLoadError } from "../errors";

/**
 * Loads raw spec content from a local file path or an http(s) URL.
 * Pure I/O — parsing and format detection live in spec-format.ts.
 *
 * @throws SpecLoadError when the file is unreadable or the URL fails
 *   (HTTP error, 30s timeout, empty body).
 */
export async function loadSpecContent(pathOrUrl: string): Promise<string> {
    if (isUrl(pathOrUrl)) {
        return await fetchUrlContent(pathOrUrl);
    }

    try {
        return fs.readFileSync(pathOrUrl, "utf8");
    } catch (error: unknown) {
        throw new SpecLoadError(
            `Failed to read spec file: ${pathOrUrl}${error instanceof Error ? ` - ${error.message}` : ""}`,
            pathOrUrl,
            error,
        );
    }
}

async function fetchUrlContent(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json, application/yaml, text/yaml, text/plain, */*",
                "User-Agent": "ng-openapi",
            },
            // 30 second timeout
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const content = await response.text();

        if (!content || content.trim() === "") {
            throw new Error(`Empty response from URL: ${url}`);
        }

        return content;
    } catch (error: unknown) {
        // Provide helpful error message
        let errorMessage = `Failed to fetch content from URL: ${url}`;

        // AbortSignal.timeout() rejects with a DOMException named "TimeoutError";
        // "AbortError" is kept for manual AbortController aborts.
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
            errorMessage += " - Request timeout (30s)";
        } else if (error instanceof Error && error.message) {
            errorMessage += ` - ${error.message}`;
        }

        throw new SpecLoadError(errorMessage, url, error);
    }
}
