/**
 * @kiorly/field-visit (KCV206, ADR-030) — shared by Kiorly Clinic, Kiorly Nurse and Kiorly Lab (home collection).
 * Pure library: no I/O, no feature flags, no timers. Each product keeps its own tables for these models.
 * Safety controls (lifecycle abort, address privacy, safety timer, SOS) are never switchable (ADR-025).
 */
export * from "./ports";
export * from "./zones";
export * from "./scheduling";
export * from "./geostamp";
export * from "./lifecycle";
export * from "./privacy";
export * from "./safety";

export const FIELD_VISIT_PACKAGE_VERSION = "0.1.0";
