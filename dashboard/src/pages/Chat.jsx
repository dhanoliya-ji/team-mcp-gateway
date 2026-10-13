// pages/Chat.jsx
// A simple chat with the agent. Under each answer we show which tools it called.

import { useState } from "react";
import { api } from "../api.js";

export default function Chat() {
  // Each message: { role: "user" | "assistant", content, toolCalls? }
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(event) {
    event.preventDefault();
    if (!text.trim() || busy) return;

    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setText("");
    setBusy(true);

    try {
      // We send only role + content. The server runs the tool loop.
      const data = await api("POST", "/api/chat", {
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
      });
      setMessages([...newMessages, { role: "assistant", content: data.reply, toolCalls: data.toolCalls }]);
    } catch (e) {
      setMessages([...newMessages, { role: "assistant", content: "Error: " + e.message, toolCalls: [] }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Chat</h1>
      <p className="muted">
        Try: "Create a product called Blue Mug with price 12" or "What orders came in today?". The agent uses the
        gateway tools as you, so every call is in the audit log under your name.
      </p>

      <div className="chat-box">
        {messages.map((m, i) => (
          <div key={i} className={"msg " + m.role}>
            {m.content}
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div className="tool-call">
                <b>Tools called:</b>
                {m.toolCalls.map((call, j) => (
                  <details key={j}>
                    <summary>
                      <span className={"badge " + (call.ok ? "ok" : "fail")}>{call.ok ? "ok" : "failed"}</span>{" "}
                      {call.name}({JSON.stringify(call.args)})
                    </summary>
                    <pre>{call.result}</pre>
                  </details>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant">Thinking and calling tools...</div>}
      </div>

      <form className="row" onSubmit={send} style={{ marginTop: 16 }}>
        <input style={{ flex: 1 }} placeholder="Ask something..." value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={busy}>Send</button>
        <button type="button" className="gray" onClick={() => setMessages([])}>Clear</button>
      </form>
    </div>
  );
}
