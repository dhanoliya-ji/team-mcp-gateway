// routes/chat.js
// POST /api/chat  { messages: [{ role, content }] }  ->  { reply, toolCalls }

import express from "express";
import { requireLogin } from "../auth.js";
import { runChat } from "../chat.js";

export const chatRoutes = express.Router();
chatRoutes.use(requireLogin);

chatRoutes.post("/", async (req, res) => {
  // Keep only simple user and assistant text messages from the browser.
  const history = (Array.isArray(req.body.messages) ? req.body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .slice(-20);

  try {
    // We pass the user's login token, so the agent acts as this user.
    const result = await runChat(req.sessionToken, history);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Chat failed: " + error.message });
  }
});
