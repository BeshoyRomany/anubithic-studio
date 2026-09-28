//Server-to-Convex credentials, one per purpose (least privilege):
//  ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY  general app plumbing (system.ts)
//  AI_CREDENTIALS_CONVEX_KEY             encrypted AI keys + AI settings (aiCredentials.ts)
//  AI_KEY_ROTATION_CONVEX_KEY            master-key rotation only (aiKeyRotation.ts);
//                                        set on the Convex deployment only during a rotation
//A missing env var always rejects (fail closed).

//Constant-time string comparison (the Convex runtime has no node:crypto).
const constantTimeEquals = (a: string, b: string) => {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
};

const requireCredential = (envName: string, provided: string) => {
  const expected = process.env[envName];
  if (!expected || expected.length < 32) {
    throw new Error(`${envName} not configured`);
  }
  if (!constantTimeEquals(provided, expected)) {
    throw new Error("Invalid server credential");
  }
};

export const validateAiCredentialsKey = (provided: string) =>
  requireCredential("AI_CREDENTIALS_CONVEX_KEY", provided);

export const validateAiRotationKey = (provided: string) =>
  requireCredential("AI_KEY_ROTATION_CONVEX_KEY", provided);
