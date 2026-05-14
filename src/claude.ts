import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "./config.js";

export type ClaudeMessage = Anthropic.MessageParam;

export interface ClaudeClient {
  raw: Anthropic;
  config: Config;
}

export function createClient(config: Config): ClaudeClient {
  const raw = new Anthropic({ apiKey: config.apiKey });
  return { raw, config };
}

/** Streams an assistant turn. onText fires per text chunk (sync or async). */
export async function streamTurn(
  client: ClaudeClient,
  args: {
    system: string;
    messages: ClaudeMessage[];
    onText?: (chunk: string) => void | Promise<void>;
  },
): Promise<{ text: string; usage: { input: number; output: number } }> {
  const { system, messages, onText } = args;

  let fullText = "";
  const stream = client.raw.messages.stream({
    model: client.config.model,
    max_tokens: client.config.maxTokens,
    system,
    messages,
  });

  stream.on("text", (chunk) => {
    fullText += chunk;
    if (onText) {
      const result = onText(chunk);
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch((err) =>
          console.error("onText error:", err),
        );
      }
    }
  });

  const finalMessage = await stream.finalMessage();
  return {
    text: fullText,
    usage: {
      input: finalMessage.usage.input_tokens,
      output: finalMessage.usage.output_tokens,
    },
  };
}

/** Non-streaming single-shot completion. */
export async function completeOnce(
  client: ClaudeClient,
  args: {
    system: string;
    messages: ClaudeMessage[];
    maxTokens?: number;
  },
): Promise<{ text: string; usage: { input: number; output: number } }> {
  const response = await client.raw.messages.create({
    model: client.config.model,
    max_tokens: args.maxTokens ?? client.config.maxTokens,
    system: args.system,
    messages: args.messages,
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return {
    text,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}
