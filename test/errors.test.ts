import { expect, test } from "bun:test";
import { SshmError } from "../src/errors.ts";

test("normalizes external failures without replacing sshm errors", () => {
  // Given
  const external = new TypeError("socket closed");
  const domain = new SshmError("ambiguous host");

  // When
  const wrapped = SshmError.from(external);
  const unchanged = SshmError.from(domain);
  const unknown = SshmError.from({ failure: true });

  // Then
  expect(wrapped).toBeInstanceOf(SshmError);
  expect(wrapped.message).toBe("socket closed");
  expect(wrapped.cause).toBe(external);
  expect(unchanged).toBe(domain);
  expect(unknown.message).toBe("An unexpected error occurred.");
});
