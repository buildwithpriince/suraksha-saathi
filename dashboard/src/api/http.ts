/** The deployed FastAPI backend (docs/06). */
import {
  ApiError,
  type ApiClient,
  type AttemptQuery,
  type CertificateQuery,
  type ExportQuery,
  type WorkerQuery,
} from "./types";

type Query = Record<string, string | number | boolean | undefined>;

function queryString(query: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function createHttpApi(baseUrl: string, getToken: () => Promise<string | null>): ApiClient {
  const base = baseUrl.replace(/\/+$/, "");

  async function request(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
    const headers = new Headers(init.headers);
    if (auth) {
      const token = await getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    if (init.body) headers.set("Content-Type", "application/json");
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { ...init, headers });
    } catch {
      throw new ApiError(0, "network_error", "Can't reach the server. Check your connection.");
    }
    if (!res.ok) {
      let code = `http_${res.status}`;
      let message = res.statusText || "Request failed";
      try {
        const body = (await res.json()) as { error?: { code?: string; message?: string } };
        code = body.error?.code ?? code;
        message = body.error?.message ?? message;
      } catch {
        // not the JSON envelope (e.g. a proxy error page)
      }
      throw new ApiError(res.status, code, message);
    }
    return res;
  }

  const get = async <T>(path: string, query: Query = {}, auth = true): Promise<T> =>
    (await (await request(`${path}${queryString(query)}`, {}, auth)).json()) as T;
  const post = async <T>(path: string, body: unknown = {}): Promise<T> =>
    (await (await request(path, { method: "POST", body: JSON.stringify(body) })).json()) as T;

  return {
    overview: () => get("/v1/admin/overview"),
    sites: () => get("/v1/admin/sites"),
    heatmap: () => get("/v1/admin/compliance/heatmap"),
    workers: (q: WorkerQuery) => get("/v1/admin/workers", { ...q }),
    worker: (id) => get(`/v1/admin/workers/${encodeURIComponent(id)}`),
    attempts: (q: AttemptQuery) => get("/v1/admin/attempts", { ...q }),
    attempt: (id) => get(`/v1/admin/attempts/${encodeURIComponent(id)}`),
    certificates: (q: CertificateQuery) => get("/v1/admin/certificates", { ...q }),
    revokeCertificate: (id, reason) =>
      post(`/v1/admin/certificates/${encodeURIComponent(id)}/revoke`, { reason }),
    recertDue: (days) => get("/v1/admin/recert-due", { days }),
    devices: (status) => get("/v1/admin/devices", { status }),
    approveDevice: (id) => post(`/v1/admin/devices/${encodeURIComponent(id)}/approve`),
    exportAttemptsCsv: async (q: ExportQuery) =>
      (await request(`/v1/admin/export/attempts.csv${queryString({ ...q })}`)).text(),
    revocations: () => get("/v1/revocations", {}, false),
    publicVerify: (token) => get("/v1/public/verify", { token }, false),
  };
}
