/**
 * Reads a newline-delimited JSON stream, calling `onLine` with each parsed line as it arrives.
 * A line split across chunks is held back until its newline comes in.
 */
export async function readNdjson<T>(
  body: ReadableStream<Uint8Array>,
  onLine: (line: T) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    // `stream: true` keeps a multi-byte character split across chunks intact.
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) if (line.trim()) onLine(JSON.parse(line) as T);
    if (done) return;
  }
}
