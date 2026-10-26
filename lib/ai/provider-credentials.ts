import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getEncryptionKey() {
  const configuredKey = process.env.AI_CREDENTIALS_ENCRYPTION_KEY;
  if (!configuredKey || !/^[A-Za-z0-9_-]{43,44}$/.test(configuredKey)) {
    throw new Error(
      "AI_CREDENTIALS_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.",
    );
  }

  const key = Buffer.from(configuredKey, "base64url");
  if (key.byteLength !== 32) {
    throw new Error(
      "AI_CREDENTIALS_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.",
    );
  }
  return key;
}

export function encryptProviderKey(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptProviderKey(encryptedKey: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] =
    encryptedKey.split(".");
  if (
    version !== "v1" ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    extra.length
  ) {
    throw new Error("Stored AI provider credential has an unsupported format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
