// WhatsApp Flow Data Exchange icin sifre cozme + sifreleme iskeleti.
// Meta protokolu:
//  - encrypted_aes_key: RSA-OAEP (SHA-256) ile sifrelenmis 16-byte AES key
//  - encrypted_flow_data: AES-128-GCM ile sifrelenmis payload (ciphertext || tag)
//  - initial_vector: 12-byte AES-GCM IV
// Yanit icin: IV bit-flip edilir, ayni AES key + ters IV ile yeniden sifrelenir,
// base64 olarak text/plain dondurulur.
//
// TODO: Production'da Meta Business Manager'dan public key yuklenir (kendi
// public/private key uretip public key'i Meta'ya pin'lemen gerek), ardindan
// WA_FLOW_PRIVATE_KEY env'iyle bu fonksiyonlar gercek calisir hale gelir.

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

export function isEncryptedFlowBody(body: unknown): body is FlowEncryptedBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.encrypted_flow_data === "string" &&
    typeof b.encrypted_aes_key === "string" &&
    typeof b.initial_vector === "string"
  );
}

// TODO: production implementasyonu
export function decryptRequest(
  body: FlowEncryptedBody,
  privateKeyPem: string,
): DecryptedFlowRequest {
  // 1) RSA-OAEP (SHA-256) ile encrypted_aes_key'i ozel anahtarla coz → aesKey (16 byte)
  // 2) AES-128-GCM ile encrypted_flow_data'yi coz:
  //    - ciphertext = ilk N byte; authTag = son 16 byte
  //    - createDecipheriv("aes-128-gcm", aesKey, iv) ile decrypt
  // 3) UTF-8 JSON parse → payload
  // 4) { payload, aesKey, iv } dondur
  void body;
  void privateKeyPem;
  void crypto;
  throw new Error("decryptRequest henuz implement edilmedi (TODO)");
}

// TODO: production implementasyonu
export function encryptResponse(
  data: unknown,
  aesKey: Buffer,
  iv: Buffer,
): string {
  // 1) IV'nin tum bitlerini tersle: flippedIv = iv.map(b => ~b & 0xff)
  // 2) createCipheriv("aes-128-gcm", aesKey, flippedIv) ile JSON.stringify(data) sifrele
  // 3) ciphertext + authTag birlestir, base64 dondur
  // 4) Endpoint: Content-Type "text/plain" ile bu string'i gonder
  void data;
  void aesKey;
  void iv;
  throw new Error("encryptResponse henuz implement edilmedi (TODO)");
}
