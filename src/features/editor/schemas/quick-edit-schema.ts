import { z } from "zod";

export const QuickEditRequestSchema = z.object({
  selectedCode: z.string(),
  fullCode: z.string().optional(),
  instruction: z.string(),
  documentation: z.string().optional(),
});

export const QuickEditResponseSchema = z.object({
  editedCode: z.string(),
});

export const quickEditAISchema = z.object({
  editedCode: z
    .string()
    .describe(
      "The edited version of the selected code based on the instruction",
    ),
});

export type QuickEditRequest = z.infer<typeof QuickEditRequestSchema>;
export type QuickEditResponse = z.infer<typeof QuickEditResponseSchema>;
export type QuickEditAIResponse = z.infer<typeof quickEditAISchema>;
