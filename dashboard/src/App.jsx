// App.jsx
// The main screen: a login form, or the menu + the chosen page.

import { useEffect, useState } from "react";
import { api, getToken, setToken } from "./api.js";
import Servers from "./pages/Servers.jsx";
import Members from "./pages/Members.jsx";
import Keys from "./pages/Keys.jsx";
import Audit from "./pages/Audit.jsx";
import Chat from "./pages/Chat.jsx";

// The menu. "adminOnly" pages are hidden for members.
const PAGES = [
  { id: "servers", title: "MCP Servers" },
  { id: "chat", title: "Chat" },
  { id: "keys", title: "API Keys" },
  { id: "members", title: "Members", adminOnly: true },
  { id: "audit", title: "Audit Log" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("servers");
  const [loading, setLoading] = useState(true);

  // On start: if we have a token, ask "who am I?"
  useEffect(() => {
    if (!getToken()) return setLoading(false);
    api("GET", "/api/me")
      .then((data) => setUser(data.user))
      .catch(() => setToken(""))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api("POST", "/api/logout").catch(() => {});
    setToken("");
    setUser(null);
  }

  if (loading) return <p className="center">Loading...</p>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="layout">
      <nav className="menu">
        <h2>MCP Gateway</h2>
        {PAGES.filter((p) => !p.adminOnly || user.role === "admin").map((p) => (
          <button key={p.id} className={page === p.id ? "active" : ""} onClick={() => setPage(p.id)}>
            {p.title}
          </button>
        ))}
        <div className="me">
          <div>{user.email}</div>
          <div className="badge">{user.role}</div>
          <button onClick={logout}>Log out</button>
        </div>
      </nav>

      <main className="content">
        {page === "servers" && <Servers user={user} />}
        {page === "chat" && <Chat />}
        {page === "keys" && <Keys user={user} />}
        {page === "members" && <Members />}
        {page === "audit" && <Audit user={user} />}
      </main>
    </div>
  );
}

// The login form.
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("POST", "/api/login", { email, password });
      setToken(data.token);
      onLogin(data.user);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <form className="login card" onSubmit={submit}>
      <h2>Team MCP Gateway</h2>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">Log in</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
