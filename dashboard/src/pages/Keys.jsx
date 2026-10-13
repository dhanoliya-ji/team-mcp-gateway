// pages/Keys.jsx
// Make and revoke API keys for MCP clients (Claude Code, Cursor, MCP Inspector).
// A new key is shown ONE time. We only keep its hash, so we cannot show it again.

import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Keys({ user }) {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const data = await api("GET", "/api/keys");
    setKeys(data.keys);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function create(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("POST", "/api/keys", { name: name || "my key" });
      setNewKey(data.apiKey);
      setName("");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function revoke(id) {
    if (!confirm("Revoke this key? It stops working right away.")) return;
    await api("DELETE", "/api/keys/" + id);
    await load();
  }

  const gatewayUrl = window.location.origin + "/mcp";

  return (
    <div>
      <h1>API Keys</h1>
      {error && <p className="error">{error}</p>}

      <form className="card row" onSubmit={create}>
        <input placeholder="Key name, e.g. my laptop" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit">Generate my key</button>
      </form>

      {newKey && (
        <div className="card">
          <b>Your new key. Copy it now, you will not see it again:</b>
          <div className="secret">{newKey}</div>
          <p>Add the gateway to Claude Code with one command:</p>
          <pre>{`claude mcp add --transport http team-gateway ${gatewayUrl} --header "Authorization: Bearer ${newKey}"`}</pre>
          <p>Or in Cursor / other clients (mcp.json):</p>
          <pre>{JSON.stringify(
            { mcpServers: { "team-gateway": { url: gatewayUrl, headers: { Authorization: "Bearer " + newKey } } } },
            null,
            2
          )}</pre>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              {user.role === "admin" && <th>User</th>}
              <th>Name</th>
              <th>Key starts with</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id}>
                {user.role === "admin" && <td>{key.userEmail}</td>}
                <td>{key.name}</td>
                <td><code>{key.prefix}...</code></td>
                <td>{new Date(key.createdAt).toLocaleString()}</td>
                <td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "-"}</td>
                <td>{key.revokedAt ? <span className="badge fail">revoked</span> : <span className="badge ok">active</span>}</td>
                <td>{!key.revokedAt && <button className="red" onClick={() => revoke(key.id)}>Revoke</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
