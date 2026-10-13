"""Tester for TikTok-kobling: kryptering (også mot web/lib/tiktok/crypto.ts) og engangslenken."""
import hashlib
import unittest
from urllib.parse import parse_qs, urlsplit

from tiktok_crypto import decrypt, encrypt, generate_keypair, public_from_private
from tiktok_link import build_link, state_hash

REDIRECT = "https://insights.nordbomarketing.no/tiktok/callback/"
PORTAL = ("https://www.tiktok.com/v2/auth/authorize?client_key=abc&scope=user.info.basic%2Cvideo.list"
          "&response_type=code&redirect_uri=https%3A%2F%2Finsights.nordbomarketing.no%2Ftiktok%2Fcallback%2F")

# Testnøkkel bare for testene (samme som web/lib/tiktok/crypto.test.ts). Brukes ikke noe annet sted.
TEST_PRIVATE = "kPzZ62Vg0CO3wszhr98TV5QZNBfozy2C/lzeFIIztHY="
# Laget av encryptToken(TEST_PUBLIC, "rft.fra-web") i web/lib/tiktok/crypto.ts
TEST_BLOB = ("v1.xBfjFo3xcapPqJSewrNeGpxu0j-qfqd1SxAsq5Pzu2PfgvohtyoTElWEoW8sOH_xtbn6o18oywWrxGF-"
             "FimNSEwuInPod_E")


class Crypto(unittest.TestCase):
    def test_roundtrip(self):
        private, public = generate_keypair()
        blob = encrypt(public, "rft.eksempel-token")
        self.assertTrue(blob.startswith("v1."))
        self.assertNotIn("rft.", blob)
        self.assertGreater(len(blob), 64)
        self.assertEqual(decrypt(private, blob), "rft.eksempel-token")
        self.assertEqual(public_from_private(private), public)

    def test_feil_nokkel_eller_endret_tekst_avvises(self):
        private, public = generate_keypair()
        other, _ = generate_keypair()
        blob = encrypt(public, "rft.x")
        with self.assertRaises(Exception):
            decrypt(other, blob)
        tampered = blob[:-2] + ("A" if blob[-2] != "A" else "B") + blob[-1]
        with self.assertRaises(Exception):
            decrypt(private, tampered)
        with self.assertRaises(ValueError):
            decrypt(private, "rft.klartekst")

    def test_samme_format_som_web(self):
        self.assertEqual(decrypt(TEST_PRIVATE, TEST_BLOB), "rft.fra-web")


class Link(unittest.TestCase):
    def test_lenken_far_state_og_disable_auto_auth(self):
        link = build_link(PORTAL, "s" * 43, REDIRECT)
        q = parse_qs(urlsplit(link).query)
        self.assertEqual(q["state"], ["s" * 43])
        self.assertEqual(q["disable_auto_auth"], ["1"])
        self.assertEqual(q["redirect_uri"], [REDIRECT])
        self.assertEqual(q["client_key"], ["abc"])

    def test_gammel_state_erstattes(self):
        link = build_link(PORTAL + "&state=gammel", "ny" * 20, REDIRECT)
        self.assertEqual(parse_qs(urlsplit(link).query)["state"], ["ny" * 20])

    def test_feil_redirect_stoppes(self):
        old = PORTAL.replace("https%3A%2F%2Finsights.nordbomarketing.no%2Ftiktok%2Fcallback%2F",
                             "https%3A%2F%2Fwww.nordbomarketing.no%2F")
        with self.assertRaises(ValueError):
            build_link(old, "s" * 43, REDIRECT)

    def test_bare_tiktok_over_https(self):
        with self.assertRaises(ValueError):
            build_link(PORTAL.replace("https://www.tiktok.com", "http://www.tiktok.com"), "s" * 43, REDIRECT)
        with self.assertRaises(ValueError):
            build_link(PORTAL.replace("www.tiktok.com", "tiktok.com.example.org"), "s" * 43, REDIRECT)

    def test_hash_er_sha256_hex_som_i_databasen(self):
        # Databasen: encode(sha256(convert_to(p_state, 'UTF8')), 'hex')
        self.assertEqual(state_hash("abc"), hashlib.sha256(b"abc").hexdigest())


if __name__ == "__main__":
    unittest.main()
