import "server-only";

// Reads a JSON body, refusing anything over `maxBytes` (declared or actual).
export const readJsonBody = async (
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> => {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) {
    return { ok: false, status: 413 };
  }
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) return { ok: false, status: 413 };

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400 };
  }
};
