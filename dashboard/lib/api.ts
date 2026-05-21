export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function backendUrl(): string {
  const isServer = typeof window === "undefined";
  if (isServer) {
    return (
      process.env.BACKEND_INTERNAL_URL ||
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "http://localhost:3001"
    );
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
}

function handleUnauthorized() {
  if (typeof window === "undefined") return;
  // Sonsuz dongu olmasin: zaten /login'deyse atla
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const url = `${backendUrl()}/api/v1${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      ...options,
      headers,
    });
  } catch (err) {
    throw new ApiError(0, `Backend'e baglanilamadi: ${(err as Error).message}`);
  }

  if (res.status === 401) {
    handleUnauthorized();
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message =
      (isJson && body && typeof body === "object" && (body as any).error) ||
      (typeof body === "string" && body) ||
      `HTTP ${res.status}`;
    throw new ApiError(res.status, String(message), body);
  }

  return body as T;
}
