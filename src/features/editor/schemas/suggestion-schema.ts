import { z } from "zod";

export const SuggestionRequestSchema = z.object({
  fileName: z.string().optional(),
  previousLines: z.string().optional(),
  lineNumber: z.number().optional(),
  currentLine: z.string().optional(),
  textBeforeCursor: z.string().optional(),
  textAfterCursor: z.string().optional(),
  nextLines: z.string().optional(),
  code: z.string().optional(),
});

export const SuggestionResponseSchema = z.object({
  suggestion: z.string(),
});

export const SuggestionAIResponseSchema = z.object({
  suggestion: z
    .string()
    .describe(
      "The code to insert at cursor, or empty string if no completion needed",
    ),
});

export type SuggestionRequest = z.infer<typeof SuggestionRequestSchema>;

export type SuggestionResponse = z.infer<typeof SuggestionResponseSchema>;
