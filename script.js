/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const chatWindow = document.getElementById("chatWindow");
const latestQuestionBar = document.getElementById("latestQuestionBar");
const latestQuestionText = document.getElementById("latestQuestionText");
const resetChatBtn = document.getElementById("resetChatBtn");
const quickPromptButtons = document.querySelectorAll(".quick-prompt-btn");

/*
 * Deployed Cloudflare Worker endpoint.
 * Requests go through the Cloudflare Worker so the OpenAI API key stays
 * securely stored inside Cloudflare's "Variables and Secrets" and never in client code.
 */
const CLOUDFLARE_WORKER_URL = "https://broad-wood-66ce.sr230.workers.dev/";

/*
 * Clear, concise system prompt guiding the assistant to focus strictly on
 * L'Oréal products, beauty routines, and personalized recommendations.
 */
const LOREAL_SYSTEM_PROMPT =
  "You are the L'Oréal Smart Product Advisor. Help users discover L'Oréal skincare, makeup, haircare, and fragrance products and build personalized routines. Remember user details like their name and past questions. Politely refuse requests unrelated to L'Oréal or beauty.";

// Initial greeting displayed in the chat window
const WELCOME_MESSAGE =
  "Bonjour! Welcome to L'Oréal Smart Product Advisor. Tell me your name or ask about L'Oréal skincare, makeup, haircare, or fragrances—I'd love to build a routine for you.";

// Store multi-turn conversation history so the assistant remembers context
let conversationHistory = [];
let isRequestInFlight = false;

/* Safely create and append a chat bubble to the chat window */
function appendMessage(role, text, extraClass = "") {
  const row = document.createElement("div");
  row.className = `msg-row ${role}${extraClass ? ` ${extraClass}` : ""}`;

  const sender = document.createElement("span");
  sender.className = "msg-sender";
  sender.textContent = role === "user" ? "You" : "L'Oréal Advisor";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;

  row.appendChild(sender);
  row.appendChild(bubble);
  chatWindow.appendChild(row);

  // Scroll to the newest message
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return row;
}

/* Update the Latest Question banner right above the chat window */
function updateLatestQuestion(question) {
  if (!question) {
    latestQuestionBar.classList.add("hidden");
    latestQuestionText.textContent = "";
    return;
  }
  latestQuestionText.textContent = question;
  latestQuestionBar.classList.remove("hidden");
}

/* Initialize or reset the chat conversation */
function initChat() {
  conversationHistory = [];
  chatWindow.textContent = "";
  updateLatestQuestion("");
  appendMessage("ai", WELCOME_MESSAGE);
}

/* Send a user message to the Cloudflare Worker endpoint using async/await */
async function sendMessage(messageText) {
  const trimmedMessage = messageText.trim();
  if (!trimmedMessage || isRequestInFlight) {
    return;
  }

  // Show the user's latest question above the chat area and in a user bubble
  updateLatestQuestion(trimmedMessage);
  appendMessage("user", trimmedMessage);

  // Save the user's turn in conversation history
  conversationHistory.push({ role: "user", content: trimmedMessage });

  // Clear input and show loading indicator while waiting for a reply
  userInput.value = "";
  isRequestInFlight = true;
  sendBtn.disabled = true;
  const loadingRow = appendMessage("ai", "Curating your L'Oréal recommendation…", "loading");

  try {
    const response = await fetch(CLOUDFLARE_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: LOREAL_SYSTEM_PROMPT },
          ...conversationHistory,
        ],
      }),
    });

    const data = await response.json();
    loadingRow.remove();

    if (!response.ok || data?.error) {
      const errorMessage =
        data?.error?.message ||
        "Sorry, I couldn't reach the advisor right now. Please try again.";
      appendMessage("ai", errorMessage, "error");
      // Remove the unanswered user turn so history stays clean
      conversationHistory.pop();
      return;
    }

    // Extract the assistant reply from the OpenAI-formatted response
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      appendMessage(
        "ai",
        "I received an empty response. Please try asking your beauty question again.",
        "error"
      );
      conversationHistory.pop();
      return;
    }

    // Save assistant reply to history for multi-turn memory and display bubble
    conversationHistory.push({ role: "assistant", content: reply });
    appendMessage("ai", reply);
  } catch (error) {
    loadingRow.remove();
    appendMessage(
      "ai",
      "Network error while contacting the L'Oréal Advisor. Please check your connection and try again.",
      "error"
    );
    conversationHistory.pop();
  } finally {
    isRequestInFlight = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

/* Handle form submission */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await sendMessage(userInput.value);
});

/* Handle suggested prompt buttons */
quickPromptButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const promptText = button.getAttribute("data-prompt") || "";
    await sendMessage(promptText);
  });
});

/* Handle New Chat reset */
resetChatBtn.addEventListener("click", () => {
  initChat();
  userInput.focus();
});

// Start with the welcome greeting on page load
initChat();
