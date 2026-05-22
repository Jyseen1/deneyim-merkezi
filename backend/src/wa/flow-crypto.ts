// WhatsApp Flow Data Exchange — uçtan uca şifreleme.
// Protokol: https://developers.facebook.com/docs/whatsapp/flows/reference/implementingyourflowendpoint
//
// İstek payload formatı (Meta → bizim endpoint):
//   {
//     "encrypted_aes_key":  base64,   // RSA-OAEP(SHA-256) ile sifrelenmis 16-byte AES key
//     "initial_vector":     base64,   // 12-byte AES-GCM IV
//     "encrypted_flow_data": base64   // AES-128-GCM ciphertext || authTag (son 16 byte)
//   }
//
// Yanıt: aynı AES key, IV'nin BYTE-WISE NOT'u (her byte XOR 0xFF) ile
// AES-128-GCM şifrele. ciphertext || authTag base64 → text/plain.

import crypto from "node:crypto";

export type FlowEncryptedBody = {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
};

export type DecryptedFlowRequest = {
  payload: unknown;
  aesKey: Buffer;
  iv: Buffer;
};

const AUTH_TAG_LENGTH = 16; // AES-GCM authentication tag

export function isEncryptedFlowBody(body: unknown): body is FlowEncryptedBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.encrypted_flow_data === "string" &&
    typeof b.encrypted_aes_key === "string" &&
    typeof b.initial_vector === "string"
  );
}

// Env'den private key'i okur. Iki format desteklenir:
//  - Saf PEM (cok satirli "-----BEGIN PRIVATE KEY-----...")
//  - Base64'lenmis PEM (Railway gibi tek-satir env paneli icin)
export function loadPrivateKey(): string | null {
  const raw = process.env.WA_FLOW_PRIVATE_KEY;
  if (!raw) return null;
  if (raw.includes("-----BEGIN")) return raw;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    if (decoded.includes("-----BEGIN")) return decoded;
  } catch {
    /* fall through */
  }
  return null;
}

export function decryptRequest(
  body: FlowEncryptedBody,
  privateKeyPem: string,
): DecryptedFlowRequest {
  // 1) RSA-OAEP (SHA-256) ile AES key'i coz (16 byte)
  const aesKey = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(body.encrypted_aes_key, "base64"),
  );

  // 2) AES-128-GCM ile flow_data'yi coz
  const iv = Buffer.from(body.initial_vector, "base64");
  const encryptedAndTag = Buffer.from(body.encrypted_flow_data, "base64");
  const ciphertext = encryptedAndTag.subarray(0, -AUTH_TAG_LENGTH);
  const authTag = encryptedAndTag.subarray(-AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // 3) JSON parse
  const payload = JSON.parse(plaintext.toString("utf-8"));
  return { payload, aesKey, iv };
}

export function encryptResponse(
  data: unknown,
  aesKey: Buffer,
  iv: Buffer,
): string {
  // 1) IV bit-flip: her byte XOR 0xFF (Meta gereksinimi)
  const flippedIv = Buffer.from(iv.map((b) => b ^ 0xff));

  // 2) AES-128-GCM ile JSON sifrele
  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, flippedIv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // 3) ciphertext || authTag base64
  return Buffer.concat([ciphertext, authTag]).toString("base64");
}
