import baseConfig from "../../eslint.config.mjs";

// This file exists so @nx/eslint/plugin infers a lint target for the
// testing harness; the root config supplies all rules.
export default [...baseConfig];
