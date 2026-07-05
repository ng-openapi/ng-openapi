/**
 * Progress/diagnostics contract between the pure orchestrator and whatever
 * hosts it (CLI, tests, programmatic callers). The orchestrator never logs;
 * presentation lives entirely in the host's Reporter implementation
 * (REFACTORING_PLAN.md phase 3.4).
 */

export type GenerationPhase = "processing-spec" | "types-generated" | "services-generated" | "plugins-generated";

export interface Reporter {
    /** Called when a generation phase completes (or, for "processing-spec", starts). */
    onPhase?(phase: GenerationPhase): void;
    /** Called for non-fatal problems; the same messages end up on GenerationResult.warnings. */
    onWarning?(message: string): void;
}

/** Structured outcome of generateFromConfig — inspectable, no side channel. */
export interface GenerationResult {
    /** clientName from the config, when set. */
    client?: string;
    /** Absolute paths of every file the generation wrote. */
    filesWritten: string[];
    /** Non-fatal problems encountered during generation. */
    warnings: string[];
    durationMs: number;
}
