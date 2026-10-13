// pages/Servers.jsx
// Shows every MCP server with its status and tools.
// Admins can add, edit, disable/enable and remove servers.

import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Servers({ user }) {
  const [servers, setServers] = useState([]);
  const [error, setError] = useState("");
  const isAdmin = user.role === "admin";

  async function load() {
    try {
      const data = await api("GET", "/api/servers");
      setServers(data.servers);
    } catch (e) {
      setError(e.message);
    }
  }

  // Load now, and again every 5 seconds (so the status stays fresh).
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  // A small helper: run an action, then reload the list.
  async function run(action) {
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h1>MCP Servers</h1>
      <p className="muted">
        Every enabled server's tools are available at one URL: <b>{window.location.origin}/mcp</b>. Tool names are
        "server__tool", for example "woocommerce__list_orders".
      </p>
      {error && <p className="error">{error}</p>}

      {isAdmin && <AddServer onAdd={(body) => run(() => api("POST", "/api/servers", body))} />}

      {servers.map((server) => (
        <ServerCard key={server.id} server={server} isAdmin={isAdmin} run={run} />
      ))}
    </div>
  );
}

// One server box.
function ServerCard({ server, isAdmin, run }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="card">
      <div className="row">
        <h3 style={{ margin: 0 }}>{server.name}</h3>
        <span className={"badge " + server.status}>{server.status}</span>
        <span className="muted">{server.url}</span>
      </div>
      <div className="muted">
        Credential: {server.hasCredential ? server.authType + " (hidden)" : "none"} · Last check:{" "}
        {server.checkedAt ? new Date(server.checkedAt).toLocaleTimeString() : "-"}
      </div>
      {server.error && <p className="error">Why: {server.error}</p>}

      <div className="row">
        <b>Tools ({server.tools.length}):</b>
        {server.tools.map((tool) => {
          const locked = server.adminOnlyTools.includes(tool.name);
          // Admins click a tool to make it "admin only" (locked) or open for everyone.
          function toggleLock() {
            if (!isAdmin) return;
            const list = locked
              ? server.adminOnlyTools.filter((name) => name !== tool.name)
              : [...server.adminOnlyTools, tool.name];
            run(() => api("PUT", "/api/servers/" + server.id, { adminOnlyTools: list }));
          }
          return (
            <span
              key={tool.name}
              className="badge"
              title={tool.description + (isAdmin ? "\n(click to lock / unlock for members)" : "")}
              style={{ cursor: isAdmin ? "pointer" : "default" }}
              onClick={toggleLock}
            >
              {locked ? "🔒 " : ""}
              {tool.name}
            </span>
          );
        })}
      </div>
      {isAdmin && <div className="muted">🔒 = admin only. Click a tool to lock or unlock it for members.</div>}

      <div className="row">
        <button className="gray" onClick={() => run(() => api("POST", "/api/servers/" + server.id + "/check"))}>
          Check now
        </button>
        {isAdmin && (
          <>
            <button
              className="gray"
              onClick={() => run(() => api("PUT", "/api/servers/" + server.id, { enabled: !server.enabled }))}
            >
              {server.enabled ? "Disable" : "Enable"}
            </button>
            <button className="gray" onClick={() => setEditing(!editing)}>
              Edit
            </button>
            <button
              className="red"
              onClick={() => confirm("Remove " + server.name + "?") && run(() => api("DELETE", "/api/servers/" + server.id))}
            >
              Remove
            </button>
          </>
        )}
      </div>

      {editing && (
        <ServerForm
          start={server}
          buttonText="Save"
          onSubmit={(body) => run(() => api("PUT", "/api/servers/" + server.id, body)).then(() => setEditing(false))}
        />
      )}
    </div>
  );
}

// The "add server" box.
function AddServer({ onAdd }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)}>+ Add MCP server</button>;
  return (
    <div className="card">
      <h3>Add MCP server</h3>
      <ServerForm
        start={{}}
        showName
        buttonText="Add"
        onSubmit={(body) => onAdd(body).then(() => setOpen(false))}
      />
    </div>
  );
}

// The form used for both "add" and "edit".
function ServerForm({ start, showName, buttonText, onSubmit }) {
  const [name, setName] = useState(start.name || "");
  const [url, setUrl] = useState(start.url || "");
  const [authType, setAuthType] = useState(start.authType || "none");
  const [authHeaderName, setAuthHeaderName] = useState(start.authHeaderName || "");
  const [secret, setSecret] = useState("");

  function submit(event) {
    event.preventDefault();
    const body = { url, authType, authHeaderName };
    if (showName) body.name = name;
    if (secret) body.secret = secret; // empty = keep the old secret
    onSubmit(body);
  }

  return (
    <form onSubmit={submit}>
      <div className="row">
        {showName && <input placeholder="name (a-z, 0-9, -)" value={name} onChange={(e) => setName(e.target.value)} />}
        <input style={{ width: 340 }} placeholder="http://server:3000/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div className="row">
        <select value={authType} onChange={(e) => setAuthType(e.target.value)}>
          <option value="none">No credential</option>
          <option value="bearer">Bearer token</option>
          <option value="header">Custom header</option>
        </select>
        {authType === "header" && (
          <input placeholder="Header name, e.g. X-API-Key" value={authHeaderName} onChange={(e) => setAuthHeaderName(e.target.value)} />
        )}
        {authType !== "none" && (
          <input
            type="password"
            placeholder={start.hasCredential ? "New secret (empty = keep old)" : "Secret"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        )}
        <button type="submit">{buttonText}</button>
      </div>
    </form>
  );
}
