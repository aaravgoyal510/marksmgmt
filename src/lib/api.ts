export function getApiUrl(endpoint: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "/api";
  const cleanBase = base.replace(/\/+$/, "");
  let cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (cleanEndpoint === "/api" || cleanEndpoint.startsWith("/api/")) {
    if (cleanBase === "/api") {
      return cleanEndpoint;
    }
    cleanEndpoint = cleanEndpoint.slice(4) || "/";
    if (!cleanEndpoint.startsWith("/")) {
      cleanEndpoint = `/${cleanEndpoint}`;
    }
  }

  return `${cleanBase}${cleanEndpoint === "/" && cleanBase.length > 0 ? "" : cleanEndpoint}`;
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const targetUrl = getApiUrl(endpoint);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest", // Double-submit CSRF Protection Header
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(targetUrl, {
    ...options,
    credentials: "include", // Send HttpOnly Cookies automatically
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw { status: res.status, data };
  }

  return data;
}
