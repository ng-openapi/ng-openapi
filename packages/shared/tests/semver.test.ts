import { describe, expect, it } from "vitest";
import { isSemver } from "../src";

describe("isSemver", () => {
    it("accepts plain and annotated versions", () => {
        for (const version of ["0.0.0", "1.2.3", "10.20.30", "1.0.0-rc.1", "1.0.0-beta.1+build.5", "2.0.0+sha.abc"]) {
            expect(isSemver(version), version).toBe(true);
        }
    });

    it("rejects what npm would normalize or refuse", () => {
        for (const version of [
            "1.0",
            "1",
            "v1.0.0",
            "01.2.3",
            "1.02.3",
            "^1.0.0",
            "~1.0.0",
            "1.2.3.4",
            " 1.0.0",
            "",
            "latest",
        ]) {
            expect(isSemver(version), JSON.stringify(version)).toBe(false);
        }
    });
});
