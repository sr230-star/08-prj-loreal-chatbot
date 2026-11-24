import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = "0.0.0.0";

const LOREAL_SYSTEM_PROMPT = `You are the L'Oréal Smart Product Advisor, a knowledgeable, warm, and refined beauty consultant for L'Oréal.
Your role is to help users discover and understand L'Oréal's range of products across skincare, makeup, haircare, and fragrances, as well as build personalized routines and product recommendations.
Guidelines:
1. Remember details shared earlier in the conversation (such as the user's name, skin type, hair type, preferences, or past questions) and tailor your advice accordingly.
2. Give clear, concise, practical recommendations with routine steps (e.g., cleanser, serum, moisturizer, SPF) when helpful.
3. Stay strictly focused on L'Oréal products, beauty routines, skincare, haircare, makeup, fragrances, and related beauty advice.
4. If the user asks about topics unrelated to L'Oréal or beauty (such as coding, politics, math homework, or general trivia), politely refuse and warmly redirect them back to L'Oréal products and beauty routines.`;

function isSafeExternalHttpsUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "169.254.169.254" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

app.use(express.json({ limit: "64kb" }));
app.use(express.static(__dirname, { dotfiles: "ignore" }));

app.post("/api/chat", async (req, res) => {
  try {
    const rawMessages = req.body?.messages;
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return res.status(400).json({
        error: { message: "Request body must include a non-empty messages array." },
      });
    }

    const sanitizedMessages = [];
    for (const item of rawMessages.slice(-30)) {
      if (
        !item ||
        typeof item !== "object" ||
        (item.role !== "user" && item.role !== "assistant") ||
        typeof item.content !== "string"
      ) {
        continue;
      }
      const trimmed = item.content.trim().slice(0, 4000);
      if (trimmed.length > 0) {
        sanitizedMessages.push({ role: item.role, content: trimmed });
      }
    }

    if (sanitizedMessages.length === 0) {
      return res.status(400).json({
        error: { message: "Please provide a valid message." },
      });
    }

    const outboundMessages = [
      { role: "system", content: LOREAL_SYSTEM_PROMPT },
      ...sanitizedMessages,
    ];

    const workerUrl = process.env.CLOUDFLARE_WORKER_URL?.trim();
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (workerUrl) {
      if (!isSafeExternalHttpsUrl(workerUrl)) {
        return res.status(500).json({
          error: { message: "Configured CLOUDFLARE_WORKER_URL must be a valid public HTTPS URL." },
        });
      }

      const workerResponse = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: outboundMessages }),
      });

      const workerData = await workerResponse.json();
      return res.status(workerResponse.status).json(workerData);
    }

    if (!apiKey) {
      return res.status(503).json({
        error: {
          message:
            "AI endpoint not configured yet. Set OPENAI_API_KEY or CLOUDFLARE_WORKER_URL in your server environment secrets.",
        },
      });
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1",
        messages: outboundMessages,
        max_completion_tokens: 450,
      }),
    });

    const data = await openaiResponse.json();
    return res.status(openaiResponse.status).json(data);
  } catch (error) {
    console.error("Chat proxy error:", error);
    return res.status(500).json({
      error: { message: "Unable to process your request right now. Please try again." },
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
