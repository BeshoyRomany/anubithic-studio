import ky from "ky";
import { toast } from "sonner";
import {
  QuickEditRequest,
  QuickEditRequestSchema,
  QuickEditResponse,
  QuickEditResponseSchema,
} from "../../schemas/quick-edit-schema";

export const fetcher = async (
  payload: QuickEditRequest,
  signal: AbortSignal,
): Promise<string | null> => {
  try {
    const validatedPayload = QuickEditRequestSchema.parse(payload);
    const response = await ky
      .post("/api/quick-edit", {
        json: validatedPayload,
        signal,
        timeout: 30_000, // think for 30 sec
        retry: 0,
      })
      .json<QuickEditResponse>();

    const validatedResponse = QuickEditResponseSchema.parse(response);

    return validatedResponse.editedCode || null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return null;
    }
    console.error("Fetcher error details:", error);
    toast.error("Failed to fetch AI quick edit");
  }
  return null;
};
