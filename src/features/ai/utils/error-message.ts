import { HTTPError } from "ky";

// The { error } message our routes send, else a fallback.
export const errorMessage = async (error: unknown, fallback: string) => {
  if (error instanceof HTTPError) {
    const body = (await error.response.json().catch(() => null)) as {
      error?: string;
    } | null;
    return body?.error ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
};
