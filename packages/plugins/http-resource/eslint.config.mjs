import baseConfig from "../../../eslint.config.mjs";

// The root config governs everything, including package.json handling —
// @nx/dependency-checks is deliberately off there (see the rationale in the
// root config). This file exists so @nx/eslint/plugin infers a lint target.
export default [...baseConfig];
