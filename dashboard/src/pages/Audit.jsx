// pages/Audit.jsx
// The audit log: every tool call, who made it, and if it worked.
// Admins see everyone. Members see only their own calls.

import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Audit({ user }) {
  const [rows, setRows] = useState([]);

  async function load() {
    const data = await api("GET", "/api/audit");
    setRows(data.rows);
  }

  // Refresh every 5 seconds.
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <h1>Audit Log</h1>
      <p className="muted">{user.role === "admin" ? "All tool calls by all users." : "Your tool calls."}</p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Via</th>
              <th>Server</th>
              <th>Tool</th>
              <th>Time taken</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.started_at).toLocaleString()}</td>
                <td>{row.user_email}</td>
                <td>{row.via}</td>
                <td>{row.server}</td>
                <td>{row.tool}</td>
                <td>{row.duration_ms} ms</td>
                <td>
                  {row.ok ? <span className="badge ok">success</span> : <span className="badge fail">failed</span>}
                  {row.error && <div className="muted">{row.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted">No tool calls yet.</p>}
      </div>
    </div>
  );
}
