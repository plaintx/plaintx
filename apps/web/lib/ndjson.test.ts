import { describe, expect, it } from "vitest";
import { readNdjson } from "./ndjson";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("readNdjson", () => {
  it("parses lines as they arrive, including lines split across chunks", async () => {
    const lines: unknown[] = [];
    await readNdjson(streamOf(['{"a":1}\n{"b"', ":2}\n", '{"c":3}\n']), (l) => lines.push(l));
    expect(lines).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it("reads a last line without a trailing newline and skips blank lines", async () => {
    const lines: unknown[] = [];
    await readNdjson(streamOf(['{"a":1}\n\n', '{"b":2}']), (l) => lines.push(l));
    expect(lines).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
