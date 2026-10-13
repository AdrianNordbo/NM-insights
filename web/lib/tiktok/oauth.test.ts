import { describe, expect, it, vi } from "vitest";
import {
  exchangeCode,
  fetchProfile,
  missingScopes,
  parseScopes,
  readCallbackParams,
  REQUIRED_SCOPES,
  TOKEN_URL,
  tiktokServerEnv,
  type TikTokEnv,
} from "./oauth";

const STATE = "a".repeat(43);
const ENV: TikTokEnv = {
  clientId: "app-id",
  clientSecret: "hemmelig-testverdi",
  redirectUri: "https://insights.nordbomarketing.no/tiktok/callback/",
  publicKey: "BuMR1OVkyTbxYB31Z51q9F0cZR0vAmVHGoyeNLgASis=",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("callback-adressen", () => {
  it("leser auth_code (eller code) og state", () => {
    expect(readCallbackParams({ auth_code: "x", state: STATE })).toEqual({ ok: true, code: "x", state: STATE });
    expect(readCallbackParams({ code: "y", state: STATE })).toEqual({ ok: true, code: "y", state: STATE });
  });

  it("avviser manglende kode, ugyldig state og avslag i TikTok", () => {
    expect(readCallbackParams({ state: STATE }).ok).toBe(false);
    expect(readCallbackParams({ code: "x", state: "kort" }).ok).toBe(false);
    expect(readCallbackParams({ code: "x", state: `${STATE}<script>` }).ok).toBe(false);
    expect(readCallbackParams({ error: "access_denied", state: STATE }).ok).toBe(false);
  });
});

describe("scopes", () => {
  it("deler på komma og mellomrom, og finner de som mangler", () => {
    expect(parseScopes("user.info.basic,video.list video.insights")).toEqual(["user.info.basic", "video.list", "video.insights"]);
    expect(missingScopes(REQUIRED_SCOPES)).toEqual([]);
    expect(missingScopes(["video.list"])).toContain("video.insights");
  });
});

describe("servervariabler", () => {
  it("nevner bare navnene som mangler, aldri verdier", () => {
    expect(() => tiktokServerEnv({ TIKTOK_CLIENT_SECRET: "s" })).toThrow(
      "mangler TIKTOK_CLIENT_ID, TIKTOK_REDIRECT_URI, TIKTOK_TOKEN_PUBLIC_KEY",
    );
  });

  it("krever https-redirect som slutter på /tiktok/callback/", () => {
    const base = { TIKTOK_CLIENT_ID: "i", TIKTOK_CLIENT_SECRET: "s", TIKTOK_TOKEN_PUBLIC_KEY: "k" };
    expect(() => tiktokServerEnv({ ...base, TIKTOK_REDIRECT_URI: "https://insights.nordbomarketing.no/tiktok/callback" })).toThrow();
    expect(() => tiktokServerEnv({ ...base, TIKTOK_REDIRECT_URI: "https://www.nordbomarketing.no/" })).toThrow();
    expect(tiktokServerEnv({ ...base, TIKTOK_REDIRECT_URI: ENV.redirectUri }).redirectUri).toBe(ENV.redirectUri);
  });
});

describe("bytte av kode mot tokens", () => {
  it("sender riktig forespørsel og leser svaret", async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        code: 0,
        message: "OK",
        data: {
          open_id: "oid",
          scope: "user.info.basic,video.list",
          access_token: "act.x",
          refresh_token: "rft.y",
          refresh_token_expires_in: 31536000,
        },
      }),
    );
    const t = await exchangeCode(ENV, "kode", fetchImpl as unknown as typeof fetch);
    expect(t).toEqual({ openId: "oid", scopes: ["user.info.basic", "video.list"], accessToken: "act.x", refreshToken: "rft.y", refreshExpiresIn: 31536000 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TOKEN_URL);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      client_id: "app-id",
      client_secret: "hemmelig-testverdi",
      grant_type: "authorization_code",
      auth_code: "kode",
      redirect_uri: ENV.redirectUri,
    });
  });

  it("feilmeldingen har TikToks kode og melding, men aldri hemmeligheten eller koden", async () => {
    const fetchImpl = async () => json({ code: 40001, message: "auth_code is invalid" });
    const err = await exchangeCode(ENV, "engangskode", fetchImpl as unknown as typeof fetch).catch((e: Error) => e);
    expect(String(err)).toContain("40001");
    expect(String(err)).not.toContain("hemmelig-testverdi");
    expect(String(err)).not.toContain("engangskode");
  });

  it("nettverksfeil gir en generell melding", async () => {
    const fetchImpl = async () => {
      throw new Error("ECONNRESET hemmelig-testverdi");
    };
    await expect(exchangeCode(ENV, "k", fetchImpl as unknown as typeof fetch)).rejects.toThrow("Fikk ikke kontakt med TikTok.");
  });
});

describe("kontoinfo", () => {
  it("sender tokenet i headeren, ikke i adressen", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ code: 0, data: { username: "veksthuset", display_name: "Veksthuset", is_business_account: false } }),
    );
    const p = await fetchProfile("oid", "act.hemmelig", fetchImpl as unknown as typeof fetch);
    expect(p).toEqual({ username: "veksthuset", displayName: "Veksthuset", isBusinessAccount: false, hasAdvancedAccess: null });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).not.toContain("act.hemmelig");
    expect((init.headers as Record<string, string>)["Access-Token"]).toBe("act.hemmelig");
  });

  it("feil gir null, ikke unntak", async () => {
    expect(await fetchProfile("oid", "t", (async () => json({ code: 40100, message: "x" })) as unknown as typeof fetch)).toBeNull();
  });
});
