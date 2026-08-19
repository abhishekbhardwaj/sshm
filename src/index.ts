#!/usr/bin/env bun

/** Normalizes uncaught command failures into a concise process-level error. */
import { createProgram } from "./cli.ts";
import { SshmError } from "./errors.ts";

try {
  await createProgram().parseAsync();
} catch (error) {
  console.error(SshmError.from(error).message);
  process.exitCode = 1;
}
