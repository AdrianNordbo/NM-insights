// Kryptering av TikTok-refresh-tokenet før det lagres. Web har bare den offentlige nøkkelen og kan
// kryptere, men aldri dekryptere. Den private nøkkelen finnes bare i fetch-jobben (tiktok_crypto.py).
//
// Format (samme som tiktok_crypto.py):
//   "v1." + base64url(epk[32] || nonce[12] || AES-256-GCM(ciphertext || tag[16]))
//   nøkkel = HKDF-SHA256(X25519(eph, mottaker), salt = epk || mottakers offentlige nøkkel, info = INFO)

import { createCipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";

const PREFIX = "v1.";
export const INFO = "nm-insights tiktok refresh token v1";

const b64url = (b: Buffer) => b.toString("base64url");

/** Rå X25519-nøkkel (32 byte, base64) som KeyObject. */
export function publicKeyFromBase64(publicB64: string) {
  const raw = Buffer.from(publicB64, "base64");
  if (raw.length !== 32) throw new Error("TIKTOK_TOKEN_PUBLIC_KEY har feil lengde.");
  return createPublicKey({ key: { kty: "OKP", crv: "X25519", x: b64url(raw) }, format: "jwk" });
}

export function deriveKey(shared: Buffer, epk: Buffer, recipientPk: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", shared, Buffer.concat([epk, recipientPk]), INFO, 32));
}

export function encryptToken(publicB64: string, plaintext: string): string {
  const recipient = publicKeyFromBase64(publicB64);
  const recipientPk = Buffer.from(publicB64, "base64");
  const eph = generateKeyPairSync("x25519");
  const epk = Buffer.from(eph.publicKey.export({ format: "jwk" }).x!, "base64url");
  const key = deriveKey(diffieHellman({ privateKey: eph.privateKey, publicKey: recipient }), epk, recipientPk);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const sealed = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return PREFIX + b64url(Buffer.concat([epk, nonce, sealed]));
}
