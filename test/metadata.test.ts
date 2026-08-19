import { expect, test } from "bun:test";
import { parseEditableHostMetadata } from "../src/metadata.ts";

test("normalizes manager-owned tags and notes at the metadata boundary", () => {
  // Given
  const input = {
    tags: [" prod ", "prod", "", "critical"],
    note: "  Primary deployment target  ",
  };

  // When
  const metadata = parseEditableHostMetadata(input);

  // Then
  expect(metadata).toEqual({
    tags: ["prod", "critical"],
    note: "Primary deployment target",
  });
});

test("rejects tags that cannot round-trip through the comma-separated form", () => {
  // Given
  const input = { tags: ["prod,critical"], note: "" };

  // When
  const operation = () => parseEditableHostMetadata(input);

  // Then
  expect(operation).toThrow("Tags cannot contain commas");
});
