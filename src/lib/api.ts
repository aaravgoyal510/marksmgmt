const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest", // Double-submit CSRF Protection Header
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
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
