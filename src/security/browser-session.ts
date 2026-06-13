import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getEnv } from "@/src/config/env";

export type EncryptedBrowserSession = {
  encryptedPayload: string;
  iv: string;
  tag: string;
};

function encryptionKey(): Buffer {
  const secret = getEnv().OPENLINE_SESSION_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("OPENLINE_SESSION_ENCRYPTION_KEY is not configured.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptBrowserSession(value: unknown): EncryptedBrowserSession {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedPayload: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptBrowserSession<T>(input: EncryptedBrowserSession): T {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(input.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(input.encryptedPayload, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}
