import type { z } from "zod";

export interface LlmProvider {
  readonly name: string;
  available(): boolean;
  generateJson<T>(input: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
  }): Promise<T>;
}

export class TemplateOnlyLlmProvider implements LlmProvider {
  readonly name = "template";

  available(): boolean {
    return false;
  }

  async generateJson<T>(): Promise<T> {
    throw new Error("Model generation is available only inside a Jungle Grid Qwen worker.");
  }
}

export function getLlmProvider(): LlmProvider {
  return new TemplateOnlyLlmProvider();
}
