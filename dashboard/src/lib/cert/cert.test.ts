import vectors from "../../../../content/trust/test-vectors.json";
import * as b64 from "./base64url";
import { hexToBytes, isPrimeOrderPoint, publicKeyFromB64url } from "./keys";
import { signToken } from "./tokens";
import { parseRootKeyFile } from "./trust";
import { verifyCertificate, type VerifyStatus } from "./verify";

const root = publicKeyFromB64url(vectors.root_public_key);
const rootSeed = hexToBytes(vectors.root_seed_hex);
const deviceSeed = hexToBytes(vectors.device_seed_hex);
const tokens: Record<string, string> = {
  att: vectors.att,
  cert: vectors.cert,
  tampered: vectors.tampered,
  rev: vectors.rev,
};
const V1_NOW = 1789100000;
const text = new TextEncoder();

function certBody(): Record<string, unknown> {
  const body = vectors.cert.split(".")[1]!;
  return JSON.parse(new TextDecoder().decode(b64.decode(body))) as Record<string, unknown>;
}

async function status(token: string, now = V1_NOW, revocationList?: string): Promise<VerifyStatus> {
  return (await verifyCertificate(token, { rootPublicKey: root, now, revocationList: revocationList ?? null })).status;
}

describe("docs/04 shared vectors", () => {
  test.each(vectors.cases)("$id -> $expected", async (c) => {
    const rev = "rev" in c ? tokens[c.rev as string] : undefined;
    expect(await status(tokens[c.token]!, c.now, rev)).toBe(c.expected);
  });

  test("V1 exposes the certificate fields and revocation state", async () => {
    const r = await verifyCertificate(vectors.cert, { rootPublicKey: root, now: V1_NOW });
    expect(r.certificate?.wn).toBe("Ravi Munda");
    expect(r.certificate?.mods.map((m) => m.id)).toEqual(["FIRE_01", "GAS_01"]);
    expect(r.revocation).toBe("NO_LIST");
  });

  test("the V4 list is applied and dated", async () => {
    const r = await verifyCertificate(vectors.cert, { rootPublicKey: root, now: 1789600000, revocationList: vectors.rev });
    expect(r.revocation).toBe("CHECKED");
    expect(r.revocationsIat).toBeTypeOf("number");
  });

  test("the keys match the published public keys", () => {
    expect(isPrimeOrderPoint(publicKeyFromB64url(vectors.device_public_key))).toBe(true);
  });

  test("signing reproduces the vector attestation byte for byte", async () => {
    const [, body] = vectors.att.split(".");
    const parsed = JSON.parse(new TextDecoder().decode(b64.decode(body!))) as object;
    expect(await signToken("SA1", parsed, rootSeed)).toBe(vectors.att);
  });
});

describe("strict base64url (D-013)", () => {
  test("round trips", () => {
    const data = Uint8Array.from([0, 1, 2, 250, 251, 252, 253]);
    expect(b64.decode(b64.encode(data))).toEqual(data);
  });
  test.each(["QR", "QQ==", "Q", "QQ+/", "Q Q"])("rejects %s", (bad) => {
    expect(() => b64.decode(bad)).toThrow();
  });
  test("accepts QQ", () => expect(b64.decode("QQ")).toEqual(Uint8Array.from([65])));
});

describe("INVALID_FORMAT", () => {
  test.each([
    ["empty", ""],
    ["wrong prefix", vectors.cert.replace(/^SS1/, "SA1")],
    ["two parts", vectors.cert.slice(0, vectors.cert.lastIndexOf("."))],
    ["padded signature", `${vectors.cert}==`],
    ["63-byte signature", vectors.cert.slice(0, -3)],
    ["garbage", "hello"],
  ])("%s", async (_name, token) => {
    expect(await status(token)).toBe("INVALID_FORMAT");
  });

  test("BOM body", async () => {
    const json = text.encode(JSON.stringify(certBody()));
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...json]);
    const sig = vectors.cert.split(".")[2];
    expect(await status(`SS1.${b64.encode(bom)}.${sig}`)).toBe("INVALID_FORMAT");
  });

  test("float iat", async () => {
    const token = await signToken("SS1", { ...certBody(), iat: 1789000000.5 }, deviceSeed);
    expect(await status(token)).toBe("INVALID_FORMAT");
  });

  test("missing field", async () => {
    const { wn: _wn, ...rest } = certBody();
    expect(await status(await signToken("SS1", rest, deviceSeed))).toBe("INVALID_FORMAT");
  });

  test("issued in the future beyond the skew", async () => {
    const body = certBody();
    expect(await status(vectors.cert, (body.iat as number) - 301)).toBe("INVALID_FORMAT");
    expect(await status(vectors.cert, (body.iat as number) - 300)).toBe("VALID");
  });
});

describe("INVALID_ATTESTATION", () => {
  test("attestation not signed by the root", async () => {
    const att = await signToken("SA1", { did: "x", dpk: vectors.device_public_key, site: "DHN-01", iat: 1788000000, exp: 1819536000 }, deviceSeed);
    const token = await signToken("SS1", { ...certBody(), att }, deviceSeed);
    expect(await status(token)).toBe("INVALID_ATTESTATION");
  });

  test("small-order device key (D-015)", async () => {
    const identity = b64.encode(Uint8Array.from([1, ...new Array<number>(31).fill(0)]));
    const att = await signToken("SA1", { did: "x", dpk: identity, site: "DHN-01", iat: 1788000000, exp: 1819536000 }, rootSeed);
    const token = await signToken("SS1", { ...certBody(), att }, deviceSeed);
    expect(await status(token)).toBe("INVALID_ATTESTATION");
  });

  test("site mismatch", async () => {
    const token = await signToken("SS1", { ...certBody(), site: "JSR-02" }, deviceSeed);
    expect(await status(token)).toBe("INVALID_ATTESTATION");
  });

  test("issued outside the attestation window", async () => {
    const token = await signToken("SS1", { ...certBody(), iat: 1787999999 }, deviceSeed);
    expect(await status(token)).toBe("INVALID_ATTESTATION");
  });
});

describe("revocation list handling", () => {
  test("a forged list is ignored and reported as invalid", async () => {
    const forged = await signToken("SR1", { iat: 1789500000, cids: [certBody().cid] }, deviceSeed);
    const r = await verifyCertificate(vectors.cert, { rootPublicKey: root, now: V1_NOW, revocationList: forged });
    expect(r.status).toBe("VALID");
    expect(r.revocation).toBe("INVALID_LIST");
  });

  test("revocation wins over expiry", async () => {
    expect(await status(vectors.cert, 1830000000, vectors.rev)).toBe("REVOKED");
  });
});

describe("root key file", () => {
  test("placeholder text gives no key", () => {
    expect(parseRootKeyFile("REPLACE_WITH_REAL_ROOT_PUBLIC_KEY\n")).toBeNull();
  });
  test("a 43-char key with a newline parses", () => {
    expect(parseRootKeyFile(`${vectors.root_public_key}\n`)).toEqual(root);
  });
});
