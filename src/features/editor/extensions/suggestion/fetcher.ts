import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import {
  SuggestionRequest,
  SuggestionRequestSchema,
  SuggestionResponse,
  SuggestionResponseSchema,
} from "../../schemas/suggestion-schema";

export const fetcher = async (
  payload: SuggestionRequest,
  signal: AbortSignal,
): Promise<string | null> => {
  try {
    const validatedPayload = SuggestionRequestSchema.parse(payload);
    const response = await ky
      .post("/api/suggestion", {
        json: validatedPayload,
        signal,
        timeout: 30_000, // think for 30 sec
        retry: 0,
      })
      .json<SuggestionResponse>();

    const validatedResponse = SuggestionResponseSchema.parse(response);

    return validatedResponse.suggestion || null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return null;
    }
    // No key, or rate-limited: stay quiet instead of toasting on every pause
    if (
      error instanceof HTTPError &&
      (error.response.status === 402 || error.response.status === 429)
    ) {
      return null;
    }
    console.error("Fetcher error details:", error);
    toast.error("Failed to fetch AI completion");
  }
  return null;
};
