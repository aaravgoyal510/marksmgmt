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

export async function fetchApi(endpoint: string, options: RequestInit = {}, isRetry = false): Promise<any> {
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

  // Handle 401 Unauthorized token expiration & attempt transparent refresh
  if (res.status === 401 && !isRetry) {
    const isAuthEndpoint =
      endpoint.includes("/auth/login") ||
      endpoint.includes("/auth/refresh") ||
      endpoint.includes("/auth/forgot-password") ||
      endpoint.includes("/auth/reset-password");

    if (!isAuthEndpoint) {
      try {
        const refreshRes = await fetch(getApiUrl("/auth/refresh"), {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        if (refreshRes.ok) {
          // Token refreshed successfully, retry original request
          return fetchApi(endpoint, options, true);
        }
      } catch {
        // Refresh failed
      }

      // If refresh failed and we are in browser, redirect to login
      if (typeof window !== "undefined") {
        const publicPages = ["/", "/forgot-password", "/reset-password"];
        if (!publicPages.includes(window.location.pathname)) {
          localStorage.removeItem("userData");
          window.location.href = "/";
        }
      }
    }
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw { status: res.status, data };
  }

  return data;
}
