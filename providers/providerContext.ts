import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import cffi from "curl-cffi-node";
import zlib from "zlib";
import { headers } from "./headers";
import { OpenWebViewOptions, OpenWebViewResult, ProviderContext, ProviderKvStore } from "./types";

const IMPERSONATE_PROFILE = "chrome120";
const DEFAULT_TIMEOUT_SECONDS = 30;

type HeaderBag = Record<string, unknown> | { get?: (name: string) => unknown } | undefined | null;

const methodAliases: Record<string, string> = { delete: "del" };

function readHeader(bag: HeaderBag, name: string): string {
  if (!bag || typeof bag !== "object") return "";
  const getter = (bag as { get?: (name: string) => unknown }).get;
  if (typeof getter === "function") {
    return String(getter.call(bag, name) ?? "");
  }
  const record = bag as Record<string, unknown>;
  const match = Object.keys(record).find((key) => key.toLowerCase() === name.toLowerCase());
  return match ? String(record[match] ?? "") : "";
}

function decompressBuffer(raw: Buffer, responseHeaders: HeaderBag): Buffer {
  const encoding = readHeader(responseHeaders, "content-encoding").toLowerCase();
  if (!encoding) return raw;
  try {
    if (encoding.includes("br")) return zlib.brotliDecompressSync(raw);
    if (encoding.includes("gzip")) return zlib.gunzipSync(raw);
    if (encoding.includes("deflate")) return zlib.inflateSync(raw);
  } catch (error) {
    console.error("Response decompression failed", error);
  }
  return raw;
}

function sanitizeHeaders(input: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!input || typeof input !== "object") return result;
  const source =
    typeof Headers !== "undefined" && input instanceof Headers
      ? Object.fromEntries((input as Headers).entries())
      : (input as Record<string, unknown>);
  for (const [key, value] of Object.entries(source)) {
    if (key.toLowerCase() === "accept-encoding") continue;
    if (value === undefined || value === null) continue;
    result[key] = String(value);
  }
  return result;
}

function resolveSender(method: string) {
  const normalized = method.toLowerCase();
  const key = methodAliases[normalized] ?? normalized;
  const sender = (cffi as unknown as Record<string, unknown>)[key];
  return typeof sender === "function" ? (sender as typeof cffi.get) : cffi.get;
}

function resolveUrl(config: AxiosRequestConfig): string {
  return axios.getUri(config);
}

function resolveTimeout(config: AxiosRequestConfig): number {
  return config.timeout && config.timeout > 0
    ? Math.ceil(config.timeout / 1000)
    : DEFAULT_TIMEOUT_SECONDS;
}

function assertNotAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    throw new AxiosError("Request aborted", AxiosError.ERR_CANCELED);
  }
}

function parseBody(config: AxiosRequestConfig, buffer: Buffer, contentType: string): unknown {
  if (config.responseType === "arraybuffer" || config.responseType === "stream") {
    return buffer;
  }
  const text = buffer.toString("utf8");
  const wantsJson = config.responseType === "json" || contentType.includes("application/json");
  if (!wantsJson) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

axios.defaults.adapter = async (config): Promise<AxiosResponse> => {
  assertNotAborted(config.signal as AbortSignal | undefined);

  const send = resolveSender(config.method || "get");
  const raw = await send(resolveUrl(config), {
    headers: sanitizeHeaders(config.headers),
    data: config.data,
    impersonate: IMPERSONATE_PROFILE,
    verify: false,
    timeout: resolveTimeout(config),
  });

  assertNotAborted(config.signal as AbortSignal | undefined);

  const body = decompressBuffer(raw.buffer(), raw.headers as HeaderBag);
  const contentType = readHeader(raw.headers as HeaderBag, "content-type");

  const response: AxiosResponse = {
    data: parseBody(config, body, contentType),
    status: raw.status,
    statusText: String(raw.status),
    headers: raw.headers as any,
    config: config as any,
    request: {},
  };

  const accepted = config.validateStatus ? config.validateStatus(raw.status) : raw.status >= 200 && raw.status < 300;
  if (!accepted) {
    throw new AxiosError(
      `Request failed with status code ${raw.status}`,
      raw.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config as any,
      response.request,
      response,
    );
  }
  return response;
};

global.fetch = (async (input: any, init: any = {}) => {
  assertNotAborted(init.signal);

  const send = resolveSender(init.method || "get");
  const raw = await send(String(input?.url ?? input), {
    headers: sanitizeHeaders(init.headers),
    data: init.body,
    impersonate: IMPERSONATE_PROFILE,
    verify: false,
    followRedirects: init.redirect !== "manual",
    timeout: DEFAULT_TIMEOUT_SECONDS,
  });

  const body = decompressBuffer(raw.buffer(), raw.headers as HeaderBag);
  const text = body.toString("utf8");

  return {
    ok: raw.status >= 200 && raw.status < 300,
    status: raw.status,
    url: raw.url,
    headers: {
      get: (name: string) => readHeader(raw.headers as HeaderBag, name) || null,
      has: (name: string) => readHeader(raw.headers as HeaderBag, name) !== "",
    },
    text: async () => text,
    json: async () => JSON.parse(text),
    buffer: async () => body,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  } as unknown as Response;
}) as typeof fetch;

export function createKvStore(): ProviderKvStore {
  const memory = new Map<string, unknown>();
  return {
    get: async <T = unknown>(key: string) => memory.get(key) as T | undefined,
    set: async (key, value) => {
      memory.set(key, value);
    },
    delete: async (key) => memory.delete(key),
    keys: async () => Array.from(memory.keys()),
    clear: async () => {
      memory.clear();
    },
  };
}

export async function unsupportedWebView(
  url: string,
  _options?: OpenWebViewOptions,
): Promise<OpenWebViewResult> {
  throw new Error(`openWebView is not available in this runtime (requested ${url})`);
}

export const providerContext: ProviderContext = {
  axios,
  commonHeaders: headers,
  cheerio,
  openWebView: unsupportedWebView,
  kvStore: createKvStore(),
  getCookies: async () => ({}),
};
