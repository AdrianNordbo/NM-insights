"""
NM Insights - kryptering av TikTok-refresh-tokenet.

Callbacken på insights.nordbomarketing.no har bare den offentlige nøkkelen og kan kryptere, men aldri
dekryptere. Den private nøkkelen ligger bare i .env og GitHub Secrets (TIKTOK_TOKEN_PRIVATE_KEY).

Format (samme som web/lib/tiktok/crypto.ts):
    "v1." + base64url(epk[32] || nonce[12] || AES-256-GCM(ciphertext || tag[16]))
    nøkkel = HKDF-SHA256(X25519(eph, mottaker), salt = epk || mottakers offentlige nøkkel, info = INFO)
Nøklene lagres som base64 (standard) av de rå 32 bytene.
"""
import base64
import os

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

PREFIX = "v1."
INFO = b"nm-insights tiktok refresh token v1"
RAW = serialization.Encoding.Raw


def _raw_public(key):
    return key.public_bytes(RAW, serialization.PublicFormat.Raw)


def _derive(shared, epk, recipient_pk):
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=epk + recipient_pk, info=INFO).derive(shared)


def generate_keypair():
    """(privat, offentlig) som base64."""
    private = X25519PrivateKey.generate()
    raw_private = private.private_bytes(RAW, serialization.PrivateFormat.Raw, serialization.NoEncryption())
    return base64.b64encode(raw_private).decode(), base64.b64encode(_raw_public(private.public_key())).decode()


def public_from_private(private_b64):
    private = X25519PrivateKey.from_private_bytes(base64.b64decode(private_b64))
    return base64.b64encode(_raw_public(private.public_key())).decode()


def encrypt(public_b64, plaintext):
    recipient_pk = base64.b64decode(public_b64)
    eph = X25519PrivateKey.generate()
    epk = _raw_public(eph.public_key())
    key = _derive(eph.exchange(X25519PublicKey.from_public_bytes(recipient_pk)), epk, recipient_pk)
    nonce = os.urandom(12)
    sealed = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
    return PREFIX + base64.urlsafe_b64encode(epk + nonce + sealed).decode().rstrip("=")


def decrypt(private_b64, blob):
    if not blob.startswith(PREFIX):
        raise ValueError("Ukjent tokenformat")
    body = blob[len(PREFIX):]
    data = base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))
    epk, nonce, sealed = data[:32], data[32:44], data[44:]
    private = X25519PrivateKey.from_private_bytes(base64.b64decode(private_b64))
    key = _derive(private.exchange(X25519PublicKey.from_public_bytes(epk)), epk, _raw_public(private.public_key()))
    return AESGCM(key).decrypt(nonce, sealed, None).decode("utf-8")
