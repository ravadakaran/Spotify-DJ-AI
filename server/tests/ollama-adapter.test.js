import { ollamaAdapter, generate } from "../src/grounding.js";
const context = [
  {
    id: "a-long-track-uuid:v7:a-long-metadata-entry-uuid",
    text: "BPM tempo: 132.",
    sourceLabel: "Original author v7",
    ts: 0,
    profileVersion: 7,
  },
];
test("local model selects bounded aliases while clients receive only real versioned citations", async () => {
  const original = global.fetch;
  let request;
  try {
    global.fetch = async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return new Response(
        JSON.stringify({ response: JSON.stringify({ sourceIds: ["s0"] }) }),
      );
    };
    const result = await generate(
      context,
      "What is the tempo?",
      ollamaAdapter("reviewed-local-model"),
    );
    expect(result.generationMode).toBe("model");
    expect(result.sourceEvents).toEqual([context[0].id]);
    expect(result.citations[0]).toEqual(context[0]);
    expect(request.url).toBe("http://127.0.0.1:11434/api/generate");
    expect(request.body.prompt).not.toContain(context[0].id);
    expect(JSON.parse(request.body.prompt).context[0].id).toBe("s0");
    expect(
      request.body.format.properties.sourceIds.items.enum || [
        request.body.format.properties.sourceIds.items.const,
      ],
    ).toEqual(["s0"]);
    global.fetch = async () =>
      new Response(
        JSON.stringify({ response: JSON.stringify({ sourceIds: ["s99"] }) }),
      );
    const invalid = await generate(
      context,
      "What is the tempo?",
      ollamaAdapter("reviewed-local-model"),
    );
    expect(invalid.generationMode).toBe("template");
    expect(invalid.fallbackReason).toBe("MODEL_INVALID_OR_UNAVAILABLE");
    expect(invalid.sourceEvents).toEqual([context[0].id]);
  } finally {
    global.fetch = original;
  }
});
