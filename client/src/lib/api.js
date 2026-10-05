// In dev (two processes: Vite on 5173, API on 4000) this defaults to the LAN-friendly
// guess of "same host, port 4000". For a single-origin deploy (API serves the built
// client itself — e.g. behind a Cloudflare Tunnel) `client/.env.production` sets
// VITE_SERVER_URL="" so requests go to the current origin instead.
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? `http://${window.location.hostname}:4000`;

async function request(path, options) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const listRounds = () => request("/api/bank");
export const getRound = (id) => request(`/api/bank/${id}`);
export const createRound = (data) => request("/api/bank", { method: "POST", body: JSON.stringify(data) });
export const updateRound = (id, data) => request(`/api/bank/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteRound = (id) => request(`/api/bank/${id}`, { method: "DELETE" });
export const getRoundTypes = () => request("/api/round-types");

export const uploadImage = (dataUrl) =>
  request("/api/uploads", { method: "POST", body: JSON.stringify({ dataUrl }) });

export const signup = (data) => request("/api/auth/signup", { method: "POST", body: JSON.stringify(data) });
export const login = (data) => request("/api/auth/login", { method: "POST", body: JSON.stringify(data) });
export const logout = () => request("/api/auth/logout", { method: "POST" });
export const getMe = () => request("/api/auth/me");

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
