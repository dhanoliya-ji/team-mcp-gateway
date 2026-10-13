// pages/Members.jsx  (admins only)
// Invite team members, issue API keys for them, and disable them.

import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Members() {
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("member");
  const [message, setMessage] = useState(null); // a secret to show one time
  const [error, setError] = useState("");

  async function load() {
    const data = await api("GET", "/api/users");
    setUsers(data.users);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  // Wrap actions so errors show on screen.
  async function run(action) {
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  function invite(event) {
    event.preventDefault();
    run(async () => {
      const data = await api("POST", "/api/users", { email, name, role });
      setMessage({ title: "Invited " + data.user.email + ". Give them this one-time password:", secret: data.password });
      setEmail("");
      setName("");
    });
  }

  function issueKey(user) {
    run(async () => {
      const data = await api("POST", "/api/keys", { name: "issued by admin", userId: user.id });
      setMessage({ title: "API key for " + user.email + " (shown only once):", secret: data.apiKey });
    });
  }

  return (
    <div>
      <h1>Members</h1>
      {error && <p className="error">{error}</p>}

      <form className="card row" onSubmit={invite}>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit">Invite</button>
      </form>

      {message && (
        <div className="card">
          <b>{message.title}</b>
          <div className="secret">{message.secret}</div>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.name}</td>
                <td><span className="badge">{user.role}</span></td>
                <td>{user.disabled ? <span className="badge fail">disabled</span> : <span className="badge ok">active</span>}</td>
                <td className="row" style={{ margin: 0 }}>
                  <button className="gray" onClick={() => issueKey(user)}>Issue key</button>
                  <button
                    className={user.disabled ? "gray" : "red"}
                    onClick={() => run(() => api("PUT", "/api/users/" + user.id, { disabled: !user.disabled }))}
                  >
                    {user.disabled ? "Enable" : "Disable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
