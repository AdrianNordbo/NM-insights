import { createDecipheriv, createPrivateKey, createPublicKey, diffieHellman } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveKey, encryptToken } from "./crypto";

// Testnøkkel bare for testene (samme som tests/test_tiktok.py). Brukes ikke noe annet sted.
const TEST_PRIVATE = "kPzZ62Vg0CO3wszhr98TV5QZNBfozy2C/lzeFIIztHY=";
const TEST_PUBLIC = "BuMR1OVkyTbxYB31Z51q9F0cZR0vAmVHGoyeNLgASis=";
// Laget av tiktok_crypto.encrypt(TEST_PUBLIC, "rft.fra-python")
const FROM_PYTHON =
  "v1.Em1WKE2ky5CZr7r0Z052EdhhVvWfh4f18RL7oQ8OZhMTQ4t3EdpcRT0P_gnmn3po40CIocQE_PujAUZmadPm1ysmsqcvh2inpko";

/** Dekryptering finnes bare i testen (web skal aldri kunne lese tokenet). */
function decrypt(privateB64: string, blob: string): string {
  const data = Buffer.from(blob.slice(3), "base64url");
  const [epk, nonce, sealed] = [data.subarray(0, 32), data.subarray(32, 44), data.subarray(44)];
  const priv = Buffer.from(privateB64, "base64");
  const pub = Buffer.from(TEST_PUBLIC, "base64");
  const privateKey = createPrivateKey({
    key: { kty: "OKP", crv: "X25519", d: priv.toString("base64url"), x: pub.toString("base64url") },
    format: "jwk",
  });
  const ephPub = createPublicKey({ key: { kty: "OKP", crv: "X25519", x: epk.toString("base64url") }, format: "jwk" });
  const key = deriveKey(diffieHellman({ privateKey, publicKey: ephPub }), epk, pub);
  const d = createDecipheriv("aes-256-gcm", key, nonce);
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  return Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]).toString("utf8");
}

describe("kryptering av TikTok-tokenet", () => {
  it("krypterer slik at bare den private nøkkelen kan lese det", () => {
    const blob = encryptToken(TEST_PUBLIC, "rft.eksempel");
    expect(blob.startsWith("v1.")).toBe(true);
    expect(blob).not.toContain("rft.");
    expect(blob.length).toBeGreaterThan(64); // databasen avviser kortere
    expect(decrypt(TEST_PRIVATE, blob)).toBe("rft.eksempel");
  });

  it("gir ny chiffertekst hver gang (ny engangsnøkkel og nonce)", () => {
    expect(encryptToken(TEST_PUBLIC, "rft.x")).not.toBe(encryptToken(TEST_PUBLIC, "rft.x"));
  });

  it("samme format som tiktok_crypto.py", () => {
    expect(decrypt(TEST_PRIVATE, FROM_PYTHON)).toBe("rft.fra-python");
  });

  it("avviser en offentlig nøkkel med feil lengde", () => {
    expect(() => encryptToken("AAAA", "rft.x")).toThrow(/feil lengde/);
  });
});
