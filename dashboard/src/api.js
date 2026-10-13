// api.js
// One small helper to call the gateway API from the browser.
// It adds our login token to every request.

export function getToken() {
  return localStorage.getItem("token") || "";
}

export function setToken(token) {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

// Example: await api("GET", "/api/servers")
export async function api(method, path, body) {
  const response = await fetch(path, {
    method: method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + getToken(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  // Login is gone? Go back to the login screen.
  if (response.status === 401 && path !== "/api/login") {
    setToken("");
    window.location.reload();
  }
  if (!response.ok) throw new Error(data.error || "Request failed (" + response.status + ")");
  return data;
}
