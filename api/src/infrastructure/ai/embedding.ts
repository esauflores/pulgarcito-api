import { createMistral } from "@ai-sdk/mistral";
import { embed, embedMany } from "ai";

import type { Bindings } from "@/env";

// mistral-embed produces 1024-dim vectors — must match place.embedding's column size.
export const embedText = async (env: Bindings, text: string): Promise<number[]> => {
  const mistral = createMistral({ apiKey: env.MISTRAL_API_KEY });
  const { embedding } = await embed({ model: mistral.textEmbeddingModel("mistral-embed"), value: text });
  return embedding;
};

export const embedTexts = async (env: Bindings, texts: string[]): Promise<number[][]> => {
  const mistral = createMistral({ apiKey: env.MISTRAL_API_KEY });
  const { embeddings } = await embedMany({ model: mistral.textEmbeddingModel("mistral-embed"), values: texts });
  return embeddings;
};
