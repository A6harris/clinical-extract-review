// api/src/extractor.ts
import { z } from "zod";

const EXTRACTOR_URL = process.env.EXTRACTOR_URL;

if (!EXTRACTOR_URL) {
  throw new Error("EXTRACTOR_URL is not set");
}

export class ExtractorError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExtractorError";
  }
}

const extractedField = z.object({
  field_name: z.string(),
  value: z.string().nullable(),
  confidence: z.number(),
});

const extractResponse = z.object({
  prompt_version: z.string(),
  model: z.string(),
  fields: z.array(extractedField),
});

export type ExtractResponse = z.infer<typeof extractResponse>;

export async function callExtractor(text: string): Promise<ExtractResponse> {
  const res = await fetch(`${EXTRACTOR_URL}/extract`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(20_000),
  }).catch((err) => {
    throw new ExtractorError("extractor unreachable or timed out", {
      cause: err,
    });
  });

  if (!res.ok) {
    throw new ExtractorError(`extractor returned ${res.status}`);
  }

  const body = await res.json().catch((err) => {
    throw new ExtractorError("extractor returned non-JSON body", { cause: err });
  });

  const parsed = extractResponse.safeParse(body);

  if (!parsed.success) {
    throw new ExtractorError("extractor response failed validation", {
      cause: parsed.error,
    });
  }

  return parsed.data;
}
