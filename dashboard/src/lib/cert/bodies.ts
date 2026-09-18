/** docs/04 token bodies with strict JSON types (unknown fields ignored), like the backend's. */

export interface AttestationBody {
  did: string;
  dpk: string; // base64url raw 32-byte device public key
  site: string;
  iat: number;
  exp: number;
}

export interface ModuleScore {
  id: string;
  v: number; // scenario version
  s: number; // scorePercent of the passing attempt
}

export interface CertificateBody {
  cid: string;
  wid: string;
  wn: string;
  site: string;
  mods: ModuleScore[];
  iat: number;
  exp: number;
  lang: string;
  att: string; // the full SA1 token
}

export interface RevocationListBody {
  iat: number;
  cids: string[];
}

type Json = Record<string, unknown>;
type Parser<T> = (value: unknown) => T;

class BodyTypeError extends Error {}

function object(value: unknown): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BodyTypeError("not an object");
  }
  return value as Json;
}

function str(o: Json, key: string): string {
  const v = o[key];
  if (typeof v !== "string") throw new BodyTypeError(`${key} is not a string`);
  return v;
}

function int(o: Json, key: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isSafeInteger(v)) {
    throw new BodyTypeError(`${key} is not an integer`);
  }
  return v;
}

function list<T>(o: Json, key: string, item: Parser<T>): T[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new BodyTypeError(`${key} is not an array`);
  return v.map(item);
}

export const parseAttestation: Parser<AttestationBody> = (value) => {
  const o = object(value);
  return {
    did: str(o, "did"),
    dpk: str(o, "dpk"),
    site: str(o, "site"),
    iat: int(o, "iat"),
    exp: int(o, "exp"),
  };
};

const parseModule: Parser<ModuleScore> = (value) => {
  const o = object(value);
  return { id: str(o, "id"), v: int(o, "v"), s: int(o, "s") };
};

export const parseCertificate: Parser<CertificateBody> = (value) => {
  const o = object(value);
  return {
    cid: str(o, "cid"),
    wid: str(o, "wid"),
    wn: str(o, "wn"),
    site: str(o, "site"),
    mods: list(o, "mods", parseModule),
    iat: int(o, "iat"),
    exp: int(o, "exp"),
    lang: str(o, "lang"),
    att: str(o, "att"),
  };
};

export const parseRevocationList: Parser<RevocationListBody> = (value) => {
  const o = object(value);
  return {
    iat: int(o, "iat"),
    cids: list(o, "cids", (v) => {
      if (typeof v !== "string") throw new BodyTypeError("cid is not a string");
      return v;
    }),
  };
};
