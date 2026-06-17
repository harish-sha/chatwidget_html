const currentScript =
  document.currentScript || document.querySelector("script[data-widget-id]");

if (currentScript) {
  window.widgetId = currentScript.getAttribute("data-widget-id");
} else {
  console.error(
    "Widget Script: Could not find the script tag or 'data-widget-id' is missing.",
  );
}

// const API_BASE_URL = "http://192.168.1.29:8000";
// const API_BASE_URL = "http://95.216.43.170:8888/proCpaasRest";
const API_BASE_URL = "https://rest.celitix.com";

const fetchWithWidget = async (endpoint, options = {}) => {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log("API:", url);

    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });
    console.log(" STATUS:", response.status);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error(" API Error:", data);
      return null;
    }

    return data;
  } catch (err) {
    console.error(" Network Error:", err);
    return null;
  }
};

if (!localStorage.getItem("conversationId")) {
  localStorage.setItem("conversationId", "");
}

(function () {
  console.log(window.widgetId, " from index.js file");

  if (!window.widgetId) {
    console.error(
      "CPaaS Widget: No widget ID found. Please check your installation script.",
    );
    return;
  }

  loadCSS();

  const res = fetchWithWidget(`/getConfig/${window.widgetId}`)
    .then((data) => {
      if (!data?.data?.config) {
        console.error("Invalid API response", data);
        return;
      }

      let widgetConfig;

      try {
        widgetConfig = JSON.parse(data.data.config);
      } catch (err) {
        console.error("Failed to parse widget config:", err);
        return;
      }

      window.chatWidgetConfig = widgetConfig;

      applyStyles(widgetConfig);
      renderWidget(widgetConfig);
      renderForm(widgetConfig?.surveyForm?.surveyFormFields);
      renderFaqCards(widgetConfig?.widgetText?.conversationStarters);

      renderOperatingHours(widgetConfig.operatingHours);
      console.log("operatingHours received:", widgetConfig.operatingHours);
      console.log(
        "isOperatingHoursEnabled:",
        widgetConfig.operatingHours?.isOperatingHoursEnabled,
      );
    })
    .catch((err) => {
      console.error("Widget config fetch error:", err);
    });
})();

// *************************** CONVERSATION APIS ******************************************

function generateSessionId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16),
  );
}

async function createConversationId() {
  if (!window.widgetId) {
    console.error("No widget ID found.");
    return null;
  }

  try {
    const payload = {
      widgetId: window.widgetId,
      sessionId: generateSessionId(),
    };

    const result = await fetchWithWidget("/conversation/create", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!result) {
      throw new Error(result?.message || "Failed to create conversation");
    }

    const conversationId = result?.conversationId;
    localStorage.setItem("conversationId", conversationId);

    return conversationId;
  } catch (err) {
    console.error("Create conversation error:", err);
    return null;
  }
}

let currentPage = 1;

function getAllMessages(page = 1, append = false) {
  let storedConversationId = localStorage.getItem("conversationId");

  if (!storedConversationId) return;

  fetchWithWidget(
    `/conversation/messages/${storedConversationId}?page=${page}&limit=10`,
  )
    .then((data) => {
      const newMessages = data?.data.messages || [];
      const btn = document.getElementById("load-previous");

      if (append) {
        window.chatMessages = [...newMessages, ...(window.chatMessages || [])];
      } else {
        window.chatMessages = newMessages;
      }

      if (btn) {
        if (newMessages.length === 10) {
          btn.style.display = "block";
        } else {
          btn.style.display = "none";
        }
      }

      renderChatMessagesUI();
    })
    .catch((err) => {
      console.error("Message fetch error:", err);
    });
}

function getAllSyncMessages(append = false, afterUpdatedAt = null) {
  let storedConversationId = localStorage.getItem("conversationId");

  if (!storedConversationId) return;

  // fetchWithWidget(
  //   `/conversation/messages/${storedConversationId}/sync?afterUpdatedAt=${encodeURIComponent(afterUpdatedAt)}&limit=10&page=1`,
  // )
  fetchWithWidget(
    `/conversation/messages/${storedConversationId}/sync?afterUpdatedAt=${encodeURIComponent(afterUpdatedAt)}&limit=10`,
  )
    .then((data) => {
      const newMessages = data?.data.messages || [];

      if (append) {
        window.chatMessages = [...newMessages, ...(window.chatMessages || [])];
      } else {
        window.chatMessages = newMessages;
      }

      renderChatMessagesUI();
    })
    .catch((err) => {
      console.error("Message fetch error:", err);
    });
}

function getLatestUpdatedAt() {
  const messages = window.chatMessages || [];
  if (!messages.length) return null;

  return messages.reduce((latest, msg) => {
    return !latest || new Date(msg.updatedAt) > new Date(latest)
      ? msg.updatedAt
      : latest;
  }, null);
}

setInterval(() => {
  const afterUpdatedAt = getLatestUpdatedAt();

  if (afterUpdatedAt) {
    getAllSyncMessages(true, afterUpdatedAt);
  }
}, 1000);

async function sendActiveMessage(data) {
  let storedConversationId = localStorage.getItem("conversationId");

  if (!storedConversationId) {
    storedConversationId = await createConversationId();

    if (!storedConversationId) {
      console.error("Failed to create conversationId");
      return;
    }
  }

  try {
    const payload = {
      conversationId: storedConversationId,
      ...data,
    };

    const result = await fetchWithWidget("/conversation/messages/send", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!result) {
      throw new Error("Something went wrong");
    }

    console.log("Message sent:", result);

    await getAllMessages();

    return result;
  } catch (err) {
    console.error("Send message error:", err);
  }
}

// *************************** CONVERSATION APIS *********************

// function loadCSS() {
//   const link = document.createElement("link");
//   link.rel = "stylesheet";
//   link.href = `${API_BASE_URL}/widget.css`;

//   document.head.appendChild(link);

//   const fontLink = document.createElement("link");
//   fontLink.rel = "stylesheet";
//   fontLink.href =
//     "https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&family=Roboto:ital,wght@0,100..900;1,100..900&display=swap";
//   document.head.appendChild(fontLink);
// }

function loadCSS() {
  // Google Fonts still loaded as a link (external CDN, benefits from caching)
  const fontLink = document.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href =
    "https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&family=Roboto:ital,wght@0,100..900;1,100..900&display=swap";
  document.head.appendChild(fontLink);

  // Guard against double injection if loadCSS runs more than once
  if (document.getElementById("cpaas-widget-styles")) return;

  const style = document.createElement("style");
  style.id = "cpaas-widget-styles";
  style.textContent = `
#chat-widget,
#chat-widget * {
  font-family: "Poppins", sans-serif;
}

.chat-wrapper {
  position: fixed;
  bottom: 70px !important;
  z-index: 9999;
  /* Mobile visibility (default) */
  display: var(--mobile-display, block);
}

.chat-wrapper-right {
  right: 20px;
}

.chat-wrapper-left {
  left: 20px;
}

.chat-box {
  width: 340px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 150px);
  background: #ffffff;
  border-radius: 24px;
  border: 1px solid #e5e5e5;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  display: none;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  overflow-x: hidden;
  margin-bottom: 10px;
  transform: translateY(40px);
  font-family: "Poppins", sans-serif;
  font-size: 14px;
}

.chat-box.show {
  display: flex;
  animation: chatFadeInUp 0.35s ease-out forwards;
}

.chat-box.hide {
  display: flex;
  animation: chatFadeOutDown 0.3s ease-in forwards;
}

@keyframes chatFadeInUp {
  from {
    opacity: 0;
    transform: translateY(40px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes chatFadeOutDown {
  from {
    opacity: 1;
    transform: translateY(0);
  }

  to {
    opacity: 0;
    transform: translateY(40px);
  }
}

.chat-launcher {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  z-index: 9999 !important;
}

/* Desktop override */
@media (min-width: 768px) {
  .chat-wrapper {
    display: var(--desktop-display, block);
  }
}

.mobile-right {
  right: 20px;
  left: auto;
}

.mobile-left {
  left: 20px;
  right: auto;
}

@media (min-width: 768px) {
  .desktop-right {
    right: 20px;
    left: auto;
  }

  .desktop-left {
    left: 20px;
    right: auto;
  }
}

/* pill button */

.chat-pill {
  background: var(--home-main-bg);
  color: var(--home-main-text);
  padding: 8px 20px;
  border-radius: 30px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
  transform: translateX(10px);
  animation: pillFadeInRight 0.35s ease-out forwards;
  cursor: pointer;
  z-index: 9999 !important;
}

.chat-pill.show {
  animation: pillFadeInRight 0.35s ease-out forwards;
}

@keyframes pillFadeInRight {
  from {
    opacity: 0;
    transform: translateX(10px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* circle button */

.chat-circle {
  background: var(--home-main-bg);
  color: var(--home-main-text);
  border-radius: 50%;
  width: 55px;
  height: 55px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
  flex-shrink: 0;
  z-index: 9999 !important;
}

.chat-circle:hover {
  transform: scale(1.05);
}

/* @media (min-width: 768px) {
  .chat-circle {
    width: 55px;
    height: 55px;
    font-size: 22px;
  }
}
@media (min-width: 320px) {
  .chat-circle {
    width: 55px;
    height: 55px;
    font-size: 22px;
  }
} */

.chat-pill:hover,

/* home  */

.home-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* TOP */
.home-top {
  background: var(--home-top-bg);
  color: white;
  padding: 24px;
  border-radius: 24px 24px 0 0;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
}

.home-avatar {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
}

.home-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-letter {
  font-size: 16px;
}

.avatar-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-letter {
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  background: #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  border-radius: 50%;
}

.home-text h2 {
  margin-top: 50px;
  margin-bottom: 5px;
  font-size: 20px;
  color: var(--home-header-color);
}

.home-text p {
  margin-top: 0;
  font-size: 14px;
  color: var(--home-header-color);
}

/* FAQ */
.faq-container {
  margin: -20px 0px 0px 0px;
  border-radius: 16px;
  max-height: 240px;
  overflow-y: scroll;
  border-radius: 40px 40px 0px 0px;

  /* Hide scrollbar - Chrome, Safari */
  scrollbar-width: none;
  /* Firefox */
  -ms-overflow-style: none;
  /* IE/Edge */
}

.faq-container::-webkit-scrollbar {
  display: none;
  /* Chrome, Safari */
}

/* CHAT CARD */

.chat-card-first {
  margin: 0px 15px 0 15px !important;
}

.chat-card {
  margin: 0px 15px 0 15px;
  background: white;
  border-radius: 16px;
  padding: 10px;
  border: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: 0.2s;
  box-shadow: 0 2px 2px rgba(0, 0, 0, 0.15);
  position: relative;
}

.chat-card:hover {
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.15);
}

.profile-title {
  font-weight: 700;
  font-size: 16px;
  color: #333;
}

.chat-title {
  font-weight: 600;
  font-size: 16px;
  color: black;
  margin: 0;
}

.chat-status {
  font-size: 12px;
  color: #888888;
  width: 220px;
  margin: 0;
}

.chat-icon {
  width: 30px;
  font-size: 25px;
  color: var(--home-top-action-bg);
  font-weight: 900;
  padding: 5px;
}

/* NAV */
.bottom-nav {
  margin-top: 20px;
  border-top: 1px solid #e0e0e0;
  padding: 10px;
  display: flex;
  justify-content: center;
  gap: 40px;
  font-size: 12px;
  color: #666;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  color: var(--home-top-action-bg);
}

.icontext {
  margin-top: 2px;
  font-weight: 400;
  color: var(--home-top-action-bg);
}

.nav-item:hover {
  color: var(--home-top-action-bg);
}

.nav-item.active {
  color: var(--home-top-action-bg);
}

/* FOOTER */
.home-footer {
  border-top: 1px solid #e0e0e0;
  padding: 16px;
  font-size: 10px;
  text-align: center;
  opacity: 0.6;
}

/* Chat  */

.chat-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 250px);
  max-height: 648px;
  min-height: 200px;
  position: relative;
}

.back-btn {
  color: #808080;
  background: transparent;
  border: none;
  cursor: pointer;
}

.profile-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 14px;
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* OPTIONS */
.menu-btn {
  border: none;
  background: none;
  cursor: pointer;
}

.chat-options {
  position: absolute;
  top: 45px;
  right: 10px;
  background: white;
  border: 1px solid #eee;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  display: none;
  flex-direction: column;
}

.chat-options button {
  border: none;
  background: none;
  padding: 8px;
  text-align: left;
  cursor: pointer;
}

.chat-options button:hover {
  background: #f5f5f5;
}

/* PRIVACY */
.privacy-box {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: #f1f1f1;
  padding: 10px;
  border-radius: 10px;
  font-size: 12px;
  width: 90%;
  display: flex;
  justify-content: space-between;
}

/* INPUT */
.chat-input {
  display: flex;
  gap: 8px;
  padding: 10px 18px;

  border-top: 1px solid rgba(255, 255, 255, 0.2);

  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.chat-input input {
  flex: 1;
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 14px;
  padding: 8px 18px;
  background-color: white;
  font-size: 14px;
  font-weight: 500;
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.05);
}

.chat-input input:focus {
  outline: none;
}

.chat-input button {
  border: none;
  background: var(--bubble-color-out);
  color: white;
  border-radius: 30%;
  width: 40px;
  height: 40px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* WELCOME BUBBLE */

.welcome-box {
  align-self: flex-end;
  background: #a8d6ea;
  color: #1f2937;
  padding: 10px 16px;
  border-radius: 20px;
  font-size: 14px;
  margin: 10px 15px 5px;
  max-width: 220px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
  position: relative;
}

/* CHAT MESSAGES */

/* BOT MESSAGE */

.chat-messages {
  display: flex;
  flex-direction: column;
}

.quick-actions-wrapper {
  position: absolute;
  bottom: 60px;
  /* above input box */
  left: 10px;
  right: 10px;

  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  padding: 4px 0;
  background: transparent;
  z-index: 10;
}

.quick-reply-btn {
  /* background: #eef2ff; */
  background: var(--bubble-color-out);
  border: 1px solid #c7d2fe;
  color: var(--bubble-color-out-text);
  padding: 6px 10px;
  border-radius: 14px;
  font-size: 12px;
  cursor: pointer;
  transition: 0.2s;
}

.quick-reply-btn:hover {
  background: color-mix(in srgb, var(--bubble-color-in) 50%, white);
}

.system-message {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 12px;
  text-align: center;
  margin: 10px auto;
  max-width: 80%;
  border: 1px solid #e2e8f0;

  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  white-space: pre-wrap;
}

.menu-btn {
  border: none;
  background: none;
  cursor: pointer;
}

.chat-options {
  position: absolute;
  top: 40px;
  right: 10px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
  display: none;
  flex-direction: column;
  min-width: 150px;
  overflow: hidden;
  z-index: 1000000;
}

.chat-options button {
  border: none;
  background: none;
  padding: 10px 15px;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
}

.chat-options button:hover {
  background: #f5f5f5;
}

/* OVERLAY */

.offline-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 9999;
}

/* POPUP */

.offline-popup {
  background: white;
  width: 90%;
  max-width: 360px;
  border-radius: 16px 16px 0 0;
  padding: 24px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.25);
  max-height: 65vh;
  overflow-y: auto;
}

/* HEADER */

.offline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.offline-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #d1d5db;
  display: flex;
  align-items: center;
  justify-content: center;
}

.offline-close {
  border: none;
  background: none;
  font-size: 20px;
  cursor: pointer;
  color: #555;
}

/* TEXT */

.offline-text {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 15px;
}

/* INPUTS */

.offline-input,
.offline-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 15px;
  font-family: inherit;
}

.offline-input:focus,
.offline-textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

/* SEND BUTTON */

.offline-send {
  width: 100%;
  background: #2563eb;
  color: white;
  font-weight: 600;
  padding: 12px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.offline-send:hover {
  background: #1d4ed8;
}

.privacy-box {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  background: #f3f4f6;
  color: #374151;
  font-size: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);

  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;

  z-index: 100;
}

.privacy-text {
  margin: 0;
  line-height: 1.4;
}

.privacy-close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: #555;
}

.privacy-close:hover {
  color: #000;
}

/* OVERLAY */

.survey-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 9999;
}

/* POPUP */

.survey-popup {
  background: white;
  width: 90%;
  max-width: 360px;
  border-radius: 16px 16px 0 0;
  padding: 24px;
  box-shadow: 0 -5px 25px rgba(0, 0, 0, 0.25);
  max-height: 65vh;
  overflow-y: auto;
}

/* HEADER */

.survey-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #d1d5db;
  display: flex;
  align-items: center;
  justify-content: center;
}

.survey-close {
  border: none;
  background: none;
  cursor: pointer;
  color: #666;
}

/* TITLE */

.survey-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 15px;
  color: #333;
}

/* INPUTS */

.survey-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 12px;
}

.survey-select {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #ddd;
  margin-bottom: 15px;
}

/* CHECKBOX */

.survey-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  margin-bottom: 10px;
  color: #555;
}

/* BUTTON */

.survey-send {
  width: 100%;
  background: #2563eb;
  color: white;
  border: none;
  padding: 12px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.survey-send:hover {
  background: #1e40af;
}

.typing-indicator {
  font-size: 12px;
  color: #888;
  font-style: italic;
  margin: 5px 0;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  background: #999;
  border-radius: 50%;
  animation: blink 1.4s infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes blink {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(1);
  }

  40% {
    opacity: 1;
    transform: scale(1.3);
  }
}

/* WhatsApp icon styling */
.whatsapp-icon {
  position: absolute;
  top: 24px;
  right: 24px;
  background: #25d366;
  color: white;
  border-radius: 50%;
  padding: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s ease;
}

.whatsapp-icon:hover {
  transform: scale(1.1);
}

.survey-container {
  display: flex;
  flex-direction: column;
  background: white;
}

.survey-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 0;
  z-index: 10;
}

.survey-header h2 {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
  color: #1f2937;
}

.survey-header p {
  font-size: 11px;
  font-weight: 500;
  color: #6b7280;
  margin: 0;
}

.survey-content {
  flex: 1;
  max-height: 500px;
  overflow-y: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  padding: 0 15px;
  margin: 0;
}

/* Width */
.survey-content::-webkit-scrollbar {
  width: 6px;
}

/* Hide arrow buttons */
.survey-content::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

/* Track */
.survey-content::-webkit-scrollbar-track {
  background: transparent;
}

/* Thumb */
.survey-content::-webkit-scrollbar-thumb {
  background: #9ca3af;
  border-radius: 999px;
}

/* Hover */
.survey-content::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}

.survey-content h3 {
  text-align: center;
  font-size: 14px;
  font-weight: 700;
}

.field {
  margin-bottom: 10px;
  width: 100%;
}

.field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #4b5563;
  margin: 4px 0;
}

.input,
.textarea {
  width: 96%;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid #d1d5db;
  outline: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.input:focus,
.textarea:focus {
  border-color: #2563eb;
}

.textarea {
  resize: none;
  height: 70px;
}

/* .radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  cursor: pointer;
}

.radio-option.active {
  border-color: #2563eb;
  background: #eff6ff;
} */

.submit-btn {
  width: 100%;
  padding: 12px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  /* margin: 20px 0; */
  margin-bottom: 20px;
}

.submit-btn:hover {
  background: #1d4ed8;
}

.form-field {
  display: flex;
  flex-direction: column;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin: 10px 0;
}

.form-options {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.form-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 12px;
  cursor: pointer;
  border: 1px solid #f3f4f6;
  background: rgba(249, 250, 251, 0.3);
  transition: all 0.2s ease;
}

/* hover like Tailwind */
.form-option:hover {
  background: #f3f4f6;
  border-color: #e5e7eb;
}

/* selected state (matches Tailwind exactly) */
.form-option.selected {
  border-color: #3b82f6;
  background: rgba(189, 202, 224, 0.08);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
}

/* input */
.form-option input {
  width: 14px;
  height: 14px;
  accent-color: #2563eb;
  cursor: pointer;
}

/* text */
.form-option-text {
  font-size: 13px;
  font-weight: 500;
  color: #4b5563;
  transition: color 0.2s ease;
}

/* selected text */
.form-option.selected .form-option-text {
  color: #1d4ed8;
}

#load-more-wrapper {
  position: fixed;
  top: 70px;
  left: 0;
  width: 100%;
  z-index: 9999;

  display: flex;
  justify-content: center;
}

/* Button styling */
#load-previous {
  background: white;
  border: 1px solid #e2e8f0;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  color: #334155;
  display: none;

  transition: all 0.2s ease;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
}

#load-previous:hover {
  background: #f8fafc;
  transform: translateY(-2px);
}

#chat-messages {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
  /* Firefox */
  -ms-overflow-style: none;
}

.chat-bg {
  position: absolute;
  /* take it out of flow */
  inset: 0;
  /* top:0 left:0 right:0 bottom:0 */

  z-index: 0;
  /* behind everything */

  background-color: var(--chat-msg-bg-color);
  background-image: var(--chat-msg-bg-image);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.chat-header,
#chat-messages {
  position: relative;
  z-index: 10;
  /* above background */
}

/* HEADER */
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 10px;
  border-bottom: 2px solid #e5e7eb;
  /* box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08); */

  background: rgba(255, 255, 255, 0.25);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  /* z-index: 1000000;  */
}

/* Row layout */
.chat-row {
  display: flex;
  align-items: flex-end;
  margin-bottom: 14px;
}

/* LEFT (bot) */
.chat-row.bot {
  justify-content: flex-start;
}

/* RIGHT (user) */
.chat-row.user {
  justify-content: flex-end;
}

/* Avatar */
.chat-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chat-avatar svg {
  width: 12px;
  height: 12px;
  fill: #475569;
}

/* spacing for sides */
.chat-row.bot .chat-avatar {
  margin-right: 8px;
}

.chat-row.user .chat-avatar {
  margin-left: 8px;
  order: 2;
}

/* borderBottomLeftRadius: msg.from === "bot" ? "4px" : "1.5rem",
                  borderBottomRightRadius: msg.from !== "bot" ? "4px" : "1.5rem", */

.bot-message {
  background: color-mix(in srgb, var(--bubble-color-in) 50%, white);
  color: var(--bubble-color-in-text);
  padding: 8px 12px;
  border-top-left-radius: 15px;
  border-top-right-radius: 15px;
  border-bottom-right-radius: 15px;
  border-bottom-left-radius: 4px;
  margin-bottom: 8px;
  max-width: 60%;
  align-self: flex-start;
  min-width: fit-content;
  word-wrap: break-word;
  overflow-wrap: break-word;

  word-break: break-word;

  white-space: pre-wrap;
}

.image-message {
  background: transparent !important;
  padding: 0 !important;
  box-shadow: none !important;
}

.user-message {
  background: var(--bubble-color-out);
  color: var(--bubble-color-in-text);
  padding: 8px;
  /* border-radius: 15px; */
  border-top-left-radius: 15px;
  border-top-right-radius: 15px;
  border-bottom-right-radius: 4px;
  border-bottom-left-radius: 15px;
  margin-bottom: 8px;
  max-width: 70%;
  align-self: flex-end;
  min-width: fit-content;
  word-wrap: break-word;
  overflow-wrap: break-word;

  word-break: break-word;

  white-space: pre-wrap;
}

/* Subtle hover (optional) */
.chat-bubble:hover {
  transform: translateY(-1px);
  transition: 0.2s ease;
}

/* wrapper needed for positioning */
.bubble-wrapper {
  position: relative;
  display: inline-block;
}

/* show on hover */
.bubble-wrapper:hover .chat-time {
  opacity: 1;
  transform: translateY(0);
}

/* content wrapper */
.chat-content {
  display: flex;
  flex-direction: column;
}

/* name above bubble */
.chat-meta {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 4px;
}

/* alignment fix */
.chat-row.user .chat-content {
  align-items: flex-end;
}

.chat-row.bot .chat-content {
  align-items: flex-start;
}

.message-content {
  display: flex;
  flex-direction: column;
  max-width: 70%;
}

/* Sender name above bubble */
.sender-name {
  font-size: 10px;
  color: #94a3b8;
  margin-bottom: 2px;
}

/* Optional: align properly */
.chat-row.user .message-content {
  align-items: flex-end;
}

.chat-row.bot .message-content {
  align-items: flex-start;
}

.chat-row .user-message,
.chat-row .bot-message {
  position: relative;
}

/* Tooltip hidden by default */
.show-timestamp .chat-row .user-message::after,
.show-timestamp .chat-row .bot-message::after {
  content: attr(data-time);
  position: absolute;
  bottom: -22px;
  right: 6px;
  font-size: 10px;
  background: #969696;
  color: #fff;
  padding: 2px 6px;
  border-radius: 6px;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(4px);
  transition: 0.2s ease;
  pointer-events: none;
}

.show-timestamp .chat-row .user-message:hover::after,
.show-timestamp .chat-row .bot-message:hover::after {
  opacity: 1;
  transform: translateY(0);
}

/* form Css  */

.form-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 10px;
  min-width: auto;
  font-family: system-ui;
}

/* Header */
.form-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 6px;
}

.form-icon {
  background: #eff6ff;
  padding: 4px;
  border-radius: 6px;
  font-size: 12px;
}

.form-title {
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
}

/* Body */
.form-body {
  max-height: auto;
  /* overflow-y: auto; */
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 9px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.form-value {
  background: #f8fafc;
  padding: 6px;
  border-radius: 8px;
  font-size: 12px;
  color: #334155;
  word-break: break-word;
}

/* Chips */
.form-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.form-chip {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 10px;
}

/* Footer */
.form-footer {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #cbd5f5;
  line-height: 1;
}

.form-footer .verified {
  color: #3b82f6;
  font-size: 10px;
  padding: 2px 4px;
  white-space: nowrap;
}

@media (min-width: 320px) and (max-width: 374px) {
  .chat-box {
    width: 290px;
  }
}

.noagent {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 24px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  text-align: center;
  font-family: "Segoe UI", sans-serif;
  z-index: 999;
}

.noagent__icon {
  width: 56px;
  height: 56px;
  background: #fff4e5;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
}

.noagent__title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0;
}

.noagent__subtitle {
  font-size: 13px;
  color: #888;
  margin: 0;
  line-height: 1.5;
}

.noagent__badge {
  display: inline-block;
  padding: 4px 12px;
  background: #fff0e0;
  color: #e07b00;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}
`;
  document.head.appendChild(style);
}

/* APPLY STYLES */
// function renderOperatingHours(operatingHours) {
//   const chatWrapper = document.getElementsByClassName("chat-wrapper")?.[0];
//   if (!chatWrapper) return;
//   if (!operatingHours?.isOperatingHoursEnabled) {
//     chatWrapper.style.display = "none";
//     return;
//   }
//   console.log("chatWrapper element:", chatWrapper);

//   const days = [
//     "sunday",
//     "monday",
//     "tuesday",
//     "wednesday",
//     "thursday",
//     "friday",
//     "saturday",
//   ];
//   const now = new Date();
//   const todayKey = days[now.getDay()];
//   const todayConfig = operatingHours?.configOperatingHours?.[todayKey];

//   if (!todayConfig || todayConfig.status !== 1) {
//     chatWrapper.style.display = "none";
//     return;
//   }

//   const [startHour, startMin] = (
//     todayConfig.starttime ||
//     todayConfig.startTime ||
//     ""
//   )
//     .split(":")
//     .map(Number);
//   const [endHour, endMin] = (todayConfig.endTime || "").split(":").map(Number);

//   if (isNaN(startHour) || isNaN(endHour)) {
//     chatWrapper.style.display = "none";
//     return;
//   }

//   const nowMinutes = now.getHours() * 60 + now.getMinutes();
//   const startMinutes = startHour * 60 + startMin;
//   const endMinutes = endHour * 60 + endMin;

//   const isWithinHours = nowMinutes >= startMinutes && nowMinutes < endMinutes;
//   chatWrapper.style.display = isWithinHours ? "block" : "none";
// }
function renderOperatingHours(operatingHours) {
  const chatWrapper = document.getElementsByClassName("chat-input")?.[0];
  const noAgent = document.getElementsByClassName("noagent")?.[0];
  if (!chatWrapper) return;
  if (!operatingHours?.isOperatingHoursEnabled) {
    chatWrapper.style.display = "flex";
    noAgent.style.display = "none";
    return;
  }
  console.log("chatWrapper element:", chatWrapper);

  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const now = new Date();
  const todayKey = days[now.getDay()];
  const todayConfig = operatingHours?.configOperatingHours?.[todayKey];

  if (!todayConfig || todayConfig.status !== 1) {
    chatWrapper.style.display = "none";
    return;
  }

  const [startHour, startMin] = (
    todayConfig.starttime ||
    todayConfig.startTime ||
    ""
  )
    .split(":")
    .map(Number);
  const [endHour, endMin] = (todayConfig.endTime || "").split(":").map(Number);

  if (isNaN(startHour) || isNaN(endHour)) {
    chatWrapper.style.display = "none";
    noAgent.style.display = "flex";
    return;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  const isWithinHours = nowMinutes >= startMinutes && nowMinutes < endMinutes;
  chatWrapper.style.display = isWithinHours ? "flex" : "none";
  noAgent.style.display = isWithinHours ? "none" : "flex";
}

function applyStyles(config) {
  document.documentElement.style.setProperty(
    "--home-main-bg",
    config?.widgetCss.selected?.value,
  );

  document.documentElement.style.setProperty(
    "--mobile-display",
    config?.visibility?.mobile?.mobileVisible ? "block" : "none",
  );

  document.documentElement.style.setProperty(
    "--desktop-display",
    config?.visibility?.desktop?.desktopVisible ? "block" : "none",
  );

  document.documentElement.style.setProperty(
    "--mobile-btn-size",
    `${config?.visibility?.mobile?.buttonSize}px`,
  );

  document.documentElement.style.setProperty(
    "--home-main-text",
    config?.widgetCss?.textColor,
  );
  document.documentElement.style.setProperty(
    "--home-top-bg",
    config?.widgetCss?.selected?.value, //done
  );
  document.documentElement.style.setProperty(
    "--home-top-action-bg",
    config?.widgetCss?.selectedActionColor?.value, //done
  );

  document.documentElement.style.setProperty(
    "--home-header-color",
    config?.widgetCss.homeHeaderColor,
  );
  document.documentElement.style.setProperty(
    "--home-header-logo",
    config?.widgetCss?.homeHeaderLogo,
  );

  document.documentElement.style.setProperty(
    "--bubble-color-in",
    config?.widgetCss?.chatBubbleColor, //done
  );
  document.documentElement.style.setProperty(
    "--bubble-color-in-text",
    config?.widgetCss?.chatBubbleTextColor,
  );
  document.documentElement.style.setProperty(
    "--bubble-color-out",
    config?.widgetCss?.chatBubbleColor, //done
  );
  document.documentElement.style.setProperty(
    "--bubble-color-out-text",
    config?.widgetCss?.chatBubbleTextColor,
  );

  if (config?.chatBg?.chatBgLink) {
    document.documentElement.style.setProperty(
      "--chat-msg-bg-image",
      `url(${config.chatBg.chatBgLink})`,
    );
    document.documentElement.style.setProperty(
      "--chat-msg-bg-color",
      "transparent",
    );
  } else {
    document.documentElement.style.setProperty(
      "--chat-msg-bg-color",
      config?.widgetCss?.chatBgColor || "#ffffff",
    );
    document.documentElement.style.setProperty("--chat-msg-bg-image", "none");
  }

  document.documentElement.style.setProperty(
    "--button-launcher-color",
    config?.widgetCss?.chatBtnLauncherColor,
  );
}

function applyButtonSize(config) {
  const circle = document.getElementById("chat-circle");
  const svg = circle?.querySelector("svg");

  if (!circle || !svg) return;

  // const buttonSize =
  //   Number(config?.visibility?.mobile?.buttonSize) || 8;

  // Control only icon size
  const iconSize = Math.max(16, buttonSize * 1.5);

  svg.style.width = `${iconSize}px`;
  svg.style.height = `${iconSize}px`;
}

function renderWidget(config = {}) {
  window.chatWidgetConfig = config;

  if (document.getElementById("chat-widget")) return;

  const mobilePosition =
    config?.visibility?.mobile?.mobilePosition === "left" ? "left" : "right";

  const desktopPosition =
    config?.visibility?.desktop?.desktopPosition === "left" ? "left" : "right";

  const container = document.createElement("div");

  document.body.appendChild(container);

  applyButtonSize(config);

  window.addEventListener("resize", () => {
    applyButtonSize(window.chatWidgetConfig);
  });

  container.id = "chat-widget";

  container.innerHTML = `
  <div class="chat-wrapper mobile-${mobilePosition} desktop-${desktopPosition}">

    <!-- Chat Box -->
   <div id="chat-box" class="chat-box mobile-${mobilePosition} desktop-${desktopPosition}">

      <div id="home-screen"></div>

      <div id="chat-screen" style="display:none;"></div>
      
      <div id="survey-screen" style="display:none;"></div>      
    </div>

    <!-- Launcher -->
    <div class="chat-launcher mobile-${mobilePosition} desktop-${desktopPosition}" onclick="toggleChat()">

      ${
        config?.visibility?.minimizedFloatingLabel?.showMinimizedLabel
          ? `<div class="chat-pill mobile-${mobilePosition} desktop-${desktopPosition}" id="chat-pill">
            ${config?.visibility?.minimizedFloatingLabel?.minimizedValue || ""}
           </div>`
          : ""
      }

      <div class="chat-circle" id="chat-circle">
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></ svg>
      </div>

    </div>

  </div>
  `;

  document.body.appendChild(container);

  loadScreens(config);
  renderForm();
}

function openHelp() {
  const url = window.chatWidgetConfig?.other?.helpUrl;
  if (!url) {
    console.warn("Help URL not configured");
    return;
  }

  window.open(url, "_blank");
}

function openWhatsapp() {
  const config = window.chatWidgetConfig;

  const phone = config?.other?.whatsappDetails?.phone;
  const message = config?.other.whatsappDetails?.desc;

  if (!phone) return;

  const url = `https://wa.me/${phone}?text=${message}`;
  window.open(url, "_blank");
}

// ********************** Survey Form ************************

const formState = {};
let formConfig = null;

function handleChange(name, value) {
  formState[name] = value;
  // renderForm(formConfig);
}

function handleChangeRadio(name, value) {
  formState[name] = value;
  renderForm(formConfig);
}

function handleCheckboxChange(name, value) {
  const current = formState[name] || [];

  if (current.includes(value)) {
    formState[name] = current.filter((v) => v !== value);
  } else {
    formState[name] = [...current, value];
  }

  renderForm(formConfig);
}

function buildPayload(schema, formValues) {
  const answers = schema
    .filter((field) => formValues[field.id] !== undefined)
    .map((field) => ({
      fieldId: field.id,
      type: field.type,
      value: formValues[field.id],
      label: field.config?.label || "",
    }));

  return answers;
}

function getCurrentTimeIST() {
  const date = new Date();

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type).value;

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+05:30`;
}

// Detect device
function getDeviceType() {
  const width = window.innerWidth;

  if (width <= 768) return "mobile";
  return "desktop";
}

async function handleSubmit() {
  const conversationId = localStorage.getItem("conversationId");
  try {
    const answers = buildPayload(
      window.chatWidgetConfig?.surveyForm?.surveyFormFields,
      formState,
    );

    const payload = {
      widgetId: window.widgetId,
      formVersion: window.chatWidgetConfig?.surveyForm?.formVersion,
      conversationId: conversationId,
      answers: answers,
      meta: {
        submittedAt: getCurrentTimeIST(),
        source: "widget",
        device: getDeviceType(),
      },
    };

    const response = await fetch(`${API_BASE_URL}/form/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Something went wrong");
    }
  } catch (error) {
    console.error("Error submitting form:", error);
    alert("Failed to submit form");
  }
}

function renderForm(data) {
  formConfig = data;
  const container = document.getElementById("surveyContent");

  if (!data || data.length === 0) {
    container.innerHTML = `<p>No form available</p>`;
    return;
  }

  container.innerHTML = data
    .map((item) => {
      switch (item.type) {
        case "heading":
          return `<h3>${item.config?.label || "Section"}</h3>`;

        case "textInput":
          return `
          <div class="field">
            <label>${item.config?.label}</label>
            <input 
              class="input"
              type="text"
              placeholder="${item.config?.placeholder}"
              value="${formState[item.name] || ""}"
              oninput="handleChange('${item.name}', this.value)"
            />
          </div>
        `;

        case "textArea":
          return `
          <div class="field">
            <label>${item.config?.label}</label>
            <textarea 
              class="textarea"
              placeholder="${item.config?.placeholder}"
              oninput="handleChange('${item.name}', this.value)"
            >${formState[item.name] || ""}</textarea>
          </div>
        `;

        case "radioButton":
        case "checkbox":
          return `
    <div class="field">

    <label>
      ${item.config?.label || "Select Option"}
    </label>

    <div class="form-options">

      ${item.config?.options
        ?.map((opt) => {
          const isRadio = item.type === "radioButton";

          const isSelected = isRadio
            ? formState[item.name] === opt
            : (formState[item.name] || []).includes(opt);

          return `
          <div class="form-option ${isSelected ? "selected" : ""}" onClick="${
            isRadio
              ? `handleChangeRadio('${item.name}', '${opt}')`
              : `handleCheckboxChange('${item.name}', '${opt}')`
          }">
            
            <input 
              type="${isRadio ? "radio" : "checkbox"}"
              name="${item.name}"
              value="${opt}"
              ${isSelected ? "checked" : ""}
            />

            <span class="form-option-text">
              ${opt}
            </span>

          </div>
        `;
        })
        .join("")}

    </div>
    </div>
    `;

        case "submitButton":
          return `
          <button class="submit-btn" onclick="handleSubmit()">
            ${item.config?.text || "Submit"}
          </button>
        `;

        default:
          return "";
      }
    })
    .join("");
}

// **************** Survey Form *******************

let open = false;
let screen = "home";

function homeScreenHTML(config) {
  return `
  <div class="home-container">

  <!-- TOP SECTION -->
  <div class="home-top">

    <!-- Avatar -->
  <div class="home-avatar">
  ${
    config?.logo?.link || config?.homeHeaderLogo
      ? `<img class="avatar-logo" src="${config?.logo?.link || config?.homeHeaderLogo}" alt="logo">`
      : `<span class="avatar-letter avatar-placeholder">${(config?.widgetText?.chatHeader).charAt(0).toUpperCase()}</span>`
  }
  </div>

    <!-- Header + Message -->
    <div class="home-text">
      <h2 id="home-header">${config?.widgetText?.homeHeader || config.homeHeader}</h2>  
      <p id="home-message">${config?.widgetText?.homeMessage || config.homeMessage}</p>
    </div>

    ${
      config?.other?.showWhatsappIcon
        ? `<div class="whatsapp-icon" onclick="openWhatsapp()">
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 16 16">
      <path d="M13.601 2.326A7.854 7.854 0 0 0 8.004 0C3.58 0 0 3.58 0 8.003c0 1.412.37 2.79 1.07 4.003L0 16l4.114-1.055a7.96 7.96 0 0 0 3.89 1.006h.003c4.423 0 8.003-3.58 8.003-8.003a7.95 7.95 0 0 0-2.409-5.622zM8.007 14.5a6.48 6.48 0 0 1-3.304-.903l-.237-.14-2.44.626.652-2.377-.154-.244a6.47 6.47 0 0 1-1.002-3.46c0-3.584 2.92-6.504 6.505-6.504 1.736 0 3.368.676 4.594 1.902a6.47 6.47 0 0 1 1.904 4.602c-.002 3.584-2.922 6.504-6.506 6.504zm3.62-4.86c-.198-.099-1.173-.578-1.354-.644-.182-.066-.314-.099-.446.1-.132.198-.512.644-.628.777-.115.132-.231.148-.429.05-.198-.099-.837-.308-1.595-.982-.59-.525-.987-1.173-1.102-1.371-.115-.198-.012-.305.086-.404.09-.089.198-.231.297-.347.099-.116.132-.198.198-.33.066-.132.033-.248-.017-.347-.05-.099-.446-1.074-.611-1.471-.161-.386-.324-.334-.446-.34l-.38-.007c-.132 0-.347.05-.528.248-.182.198-.694.678-.694 1.653s.71 1.918.81 2.05c.099.132 1.4 2.137 3.393 2.997.474.204.843.326 1.131.417.475.151.907.13 1.249.079.381-.057 1.173-.479 1.339-.942.165-.462.165-.858.116-.942-.05-.083-.182-.132-.38-.231z"/>
    </svg>
  </div>`
        : ""
    }
  </div>

  <!-- FAQ SECTION -->
  <div class="faq-container" id="faq-container"></div>
  
  <!-- CHAT CARD -->
  <div class="chat-card" onclick="setScreen('chat')">

    <div class="chat-card-text">
      <p class="chat-title">${config?.visibility?.minimizedFloatingLabel?.minimizedValue || config.chatCardTitle}</p>
      <p class="chat-status">${config?.widgetText?.offlineStatus || config.chatCardStatus}</p>
    </div>

    <div class="chat-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send" style="color: rgb(59, 44, 243);"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg>
    </div>

  </div>

  <!-- BOTTOM NAV -->
    <div class="bottom-nav">

    <div class="nav-item active">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-house-door-fill" viewBox="0 0 16 16">
  <path d="M6.5 14.5v-3.505c0-.245.25-.495.5-.495h2c.25 0 .5.25.5.5v3.5a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5"/>
  </svg>
      <span class="icontext">Home</span>
    </div>

    <div class="nav-item" onclick="setScreen('chat')">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-chat-left" viewBox="0 0 24 24">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H6l-2 2V4h16z"/>
  </svg>
      <span class="icontext">Chat</span>
    </div>

    ${
      config?.surveyForm?.enableSurveyForm
        ? `<div class="nav-item" onclick="setScreen('survey')">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
          <path d="M13 11H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h9zM4 9h7V6H4zm11 11H4c-1.1 0-2-.9-2-2v-3c0-1.1.9-2 2-2h11zM4 18h9v-3H4zm18-9h-2l2-5h-7v7h2v9zM4.75 17.25h1.5v-1.5h-1.5zm0-9h1.5v-1.5h-1.5z"></path>
        </svg>
        <span class="icontext">${config?.widgetText?.surveyLabel}</span>
      </div>`
        : ""
    }

  </div>

  <!-- FOOTER -->
  <div class="home-footer">
   POWERED BY ${config?.widgetText?.poweredBy}
  </div>

  </div>
  `;
}

function chatScreenHTML(config) {
  return `
  <div class="chat-container">
  <div class="chat-bg"></div>
  <div class="chat-header">

    <div class="chat-header-left">

      <button class="back-btn" onclick="setScreen('home')"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-chevron-left" viewBox="0 0 16 16">
        <path 
          fill-rule="evenodd"
          d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0"
          stroke="currentColor"
          stroke-width="1"
      />
      </svg></button>

      <div class="profile-avatar">
      ${
        config?.logo?.link || config?.homeHeaderLogo
          ? `<img class="avatar-logo" src="${config?.logo?.link || config?.homeHeaderLogo}" alt="logo">`
          : `<span class="avatar-letter avatar-placeholder">${config?.widgetText?.chatHeader?.charAt(0).toUpperCase()}</span>`
      }
      </div>

      <p class="profile-title">${config?.widgetText?.chatHeader}</p>

    </div>

    <button class="menu-btn" onclick="toggleOptions()">
  <svg xmlns="http://www.w3.org/2000/svg"
       width="24"
       height="20"
       fill="currentColor"
       class="bi bi-three-dots-vertical"
       viewBox="0 0 16 16">
    <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0"/>
  </svg>
</button>

    
    </div>
    <div class="chat-options" id="chat-options">
      <button onclick="clearChat()">Clear chat</button>
      <button onclick="restartChat()">Restart bot</button>
      <button onclick="openHelp()">Help</button>
    </div>
    
    <div id="load-more-wrapper">
      <button id="load-previous" onclick="loadPreviousMessages()">
        Load older messages
      </button>
    </div>
    
  <div id="scroll-bottom-wrapper" style="display: none;">
    <button id="scroll-bottom-btn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 6v10M12 16l-4-4M12 16l4-4"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"/>
      </svg>
    </button>
  </div>
  
  <div class="chat-messages" id="chat-messages">
    <div class="bot-message" id="welcome-message">
      ${config?.widgetText?.chatWelcomeMessage}
    </div>
  </div>



  <div class="quick-actions-wrapper" id="quick-replies"></div>

  <div class="chat-input">

    <input
      id="chat-input"
      type="text"
      placeholder="Type a message…"
      onkeydown="if(event.key==='Enter'){sendMessage()}"
    >

    <button onclick="sendMessage()"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg></button>

  </div>
  <div class="noagent">
  <div class="noagent__icon">🕐</div>
  <p class="noagent__title">We're currently offline</p>
  <p class="noagent__subtitle">Our team is unavailable right now.<br>Please check back during office hours.</p>
  <span class="noagent__badge">Office Hours Off</span>
</div>


  ${
    config?.other?.offlineTicket === true
      ? `
     <div class="offline-overlay" id="offline-overlay">

  <!-- Popup Box -->
  <div class="offline-popup">

    <!-- Header -->
    <div class="offline-header">

      <div class="offline-avatar">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="white" viewBox="0 0 24 24">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      </div>

      <button class="offline-close" onclick="closeOfflineTicket()">
    <svg xmlns="http://www.w3.org/2000/svg"
       width="20"
       height="20"
       viewBox="0 0 24 24"
       fill="none"
       stroke="currentColor"
       stroke-width="2"
       stroke-linecap="round"
       stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  </button>

    </div>

    <!-- Text -->
    <p class="offline-text">
      We're currently unavailable. We’ll get back to you when one of our agents is able to respond. Please provide your email address.
    </p>

    <!-- Email -->
    <input
      type="email"
      class="offline-input"
      placeholder="Enter your email..."
    />

    <!-- Message -->
    <textarea
      class="offline-textarea"
      rows="4"
      placeholder="Enter your message..."
    ></textarea>

    <!-- Submit -->
    <button class="offline-send" onclick="submitOfflineTicket()">
      Send
    </button>

    </div>

  </div>
    `
      : ``
  }

    ${
      config?.other?.privacyMsg === true
        ? `<div class="privacy-box" id="privacy-box">
      <p class="privacy-text">
        By using this chat, you agree to our Privacy Policy and Terms of Service.
      </p>

      <button class="privacy-close" onclick="closePrivacy()">✕</button>
    </div>`
        : ``
    }

    ${
      config?.other?.preChatSurvey === "true"
        ? `
       <div class="survey-overlay" id="survey-overlay">

  <div class="survey-popup">

    <!-- HEADER -->
    <div class="survey-header">

      <div class="survey-avatar">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="white" viewBox="0 0 24 24">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      </div>

      <button class="survey-close" onclick="closeSurvey()">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

    </div>

    <!-- TITLE -->
    <p class="survey-title">
      Please introduce yourself:
    </p>

    <!-- EMAIL -->
    <input
      type="email"
      class="survey-input"
      placeholder="Enter your email..."
    />

    <!-- SEND BUTTON -->
    <button class="survey-send" onclick="submitSurvey()">
      Send
    </button>

  </div>

  </div>
      `
        : ``
    }

   
  </div>
  `;
}

function surveyScreenHTML(config) {
  return `
  <div class="survey-container">

  <!-- HEADER -->
  <div class="survey-header">
    <button class="back-btn" onclick="setScreen('home')">
      <svg xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24">
        <path d="M19 12H5"></path>
        <path d="M12 19l-7-7 7-7"></path>
      </svg>
    </button>

    <div>
      <h2>Survey Form</h2>
      <p>Quick Feedback</p>
    </div>
  </div>

  <!-- CONTENT -->
  <div class="survey-content" id="surveyContent">
    <!-- Dynamic form will render here -->
  </div>

  </div>
  `;
}

window.toggleChat = function () {
  const chatBox = document.getElementById("chat-box");
  const pill = document.getElementById("chat-pill");
  const circle = document.getElementById("chat-circle");
  const launcher = document.querySelector(".chat-launcher");

  open = !open;

  if (open) {
    chatBox.classList.remove("hide");
    chatBox.classList.add("show");

    if (pill) pill.style.display = "none";

    circle.innerHTML = `
    <svg width="30" height="30" viewBox="0 0 24 24" fill="black">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    `;
    launcher.style.right = "300px";
  } else {
    chatBox.classList.remove("show");
    chatBox.classList.add("hide");

    if (pill) pill.style.display = "block";

    circle.innerHTML = `
       <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="28" 
        height="30" 
        viewBox="0 0 24 24" 
        fill="none"
      >
        <path 
          d="M4 4h16v10H7l-3 3V4z" 
          stroke="currentColor" 
          stroke-width="2" 
          stroke-linecap="round" 
          stroke-linejoin="round"
        />
      </svg>
    `;
    launcher.style.right = "20px";

    if (!open) {
      chatBox.classList.remove("hide");
    }
  }
};

window.setScreen = function (value) {
  screen = value;

  const home = document.getElementById("home-screen");
  const chat = document.getElementById("chat-screen");
  const survey = document.getElementById("survey-screen");

  if (!home || !chat || !survey) {
    console.error("Missing screen element", { home, chat, survey });
    return;
  }

  if (screen === "home") {
    home.style.display = "block";
    chat.style.display = "none";
    survey.style.display = "none";
  } else if (screen === "chat") {
    home.style.display = "none";
    chat.style.display = "block";
    survey.style.display = "none";
    setTimeout(() => {
      renderChatMessages();
    }, 0);
  } else if (screen === "survey") {
    home.style.display = "none";
    chat.style.display = "none";
    survey.style.display = "block";
  }
};

function toggleOptions() {
  const menu = document.getElementById("chat-options");

  if (menu.style.display === "flex") {
    menu.style.display = "none";
  } else {
    menu.style.display = "flex";
  }
}

document.addEventListener("click", function (e) {
  const menu = document.getElementById("chat-options");
  const btn = document.querySelector(".menu-btn");

  if (!btn.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = "none";
  }
});

function loadScreens(config) {
  document.getElementById("home-screen").innerHTML = homeScreenHTML(config);

  document.getElementById("chat-screen").innerHTML = chatScreenHTML(config);

  document.getElementById("survey-screen").innerHTML = surveyScreenHTML(config);
}

function loadPreviousMessages() {
  currentPage += 1;
  getAllMessages(currentPage, true);
}

async function sendMessage(customMessage = null) {
  const input = document.getElementById("chat-input");
  const message = customMessage || input.value.trim();

  if (!message) return;

  const chatBox = document.getElementById("chat-messages");

  const msgDiv = document.createElement("div");
  msgDiv.className = "user-message";
  msgDiv.innerText = message;
  chatBox.appendChild(msgDiv);

  if (!customMessage) input.value = "";

  chatBox.scrollTop = chatBox.scrollHeight;

  if (!customMessage) {
    sendActiveMessage({
      sender: "user",
      message: message,
      messageType: "text",
    });
  }

  if (customMessage) {
    sendActiveMessage({
      sender: "user",
      message: customMessage,
      messageType: "text",
    });
  }

  const match = window?.currentQuickActions?.find(
    (item) => item?.label === message,
  );

  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (match) {
    sendActiveMessage({
      sender: "bot",
      message: match?.value,
      messageType: "text",
    });
  }

  if (!match) return;

  const typingDiv = document.createElement("div");
  typingDiv.className = "typing-indicator";
  typingDiv.innerText = "Bot is typing...";
  chatBox.appendChild(typingDiv);

  chatBox.scrollTop = chatBox.scrollHeight;
}

function createFormSubmissionUI(payload) {
  let fields = [];

  try {
    fields = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch (e) {
    const error = document.createElement("div");
    error.innerText = "Invalid form data";
    error.style.color = "red";
    return error;
  }

  const container = document.createElement("div");
  container.className = "form-card";

  // Header
  const header = document.createElement("div");
  header.className = "form-header";

  header.innerHTML = `
    <div class="form-icon">📄</div>
    <span class="form-title">Entry Captured</span>
  `;

  // Body
  const body = document.createElement("div");
  body.className = "form-body";

  fields.forEach((field) => {
    const fieldWrapper = document.createElement("div");
    fieldWrapper.className = "form-field";

    const label = document.createElement("div");
    label.className = "form-label";
    label.innerText = field.label;

    const valueBox = document.createElement("div");
    valueBox.className = "form-value";

    if (Array.isArray(field.value)) {
      const chips = document.createElement("div");
      chips.className = "form-chips";

      field.value.forEach((val) => {
        const chip = document.createElement("span");
        chip.className = "form-chip";
        chip.innerText = val;
        chips.appendChild(chip);
      });

      valueBox.appendChild(chips);
    } else {
      valueBox.innerText = field.value || "No response";
    }

    fieldWrapper.appendChild(label);
    fieldWrapper.appendChild(valueBox);

    body.appendChild(fieldWrapper);
  });

  // Footer
  const footer = document.createElement("div");
  footer.className = "form-footer";

  footer.innerHTML = `
    <span>Ref: Internal_Log</span>
    <span class="verified">Verified Submission</span>
  `;

  container.appendChild(header);
  container.appendChild(body);
  container.appendChild(footer);

  return container;
}

function renderChatMessagesUI() {
  const chatBox = document.getElementById("chat-messages");
  if (!chatBox) return;

  const messages = window.chatMessages || [];

  chatBox.innerHTML = "";

  const showTimestamp = window.chatWidgetConfig?.other?.showTimestamp;

  if (showTimestamp) {
    chatBox.classList.add("show-timestamp");
  } else {
    chatBox.classList.remove("show-timestamp");
  }

  messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  messages.forEach((msg) => {
    if (msg.sender === "system") {
      const systemDiv = document.createElement("div");
      systemDiv.className = "system-message";
      systemDiv.innerText = msg.message;
      chatBox.appendChild(systemDiv);
      return;
    }

    const row = document.createElement("div");
    row.className = `chat-row ${msg.sender}`;

    const avatar = document.createElement("div");
    avatar.className = "chat-avatar";

    avatar.innerHTML =
      msg.sender === "user"
        ? `<svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8V22h19.2v-2.8c0-3.2-6.4-4.8-9.6-4.8z"/></svg>`
        : msg.sender === "bot"
          ? `
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path d="M12 2a2 2 0 0 1 2 2v1h2a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-1v2h-2v-2H11v2H9v-2H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h2V4a2 2 0 0 1 2-2zM9 10a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm6 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>
        </svg>
      `
          : `<svg viewBox="0 0 24 24"><path d="M12 2l7 4v6c0 5-3.5 9.7-7 10-3.5-.3-7-5-7-10V6l7-4z"/></svg>`;

    const contentWrapper = document.createElement("div");
    contentWrapper.className = "message-content";

    // sender name
    const senderName = document.createElement("div");
    senderName.className = "sender-name";
    senderName.innerText =
      msg.sender.charAt(0).toUpperCase() + msg.sender.slice(1);

    // message bubble
    const msgDiv = document.createElement("div");
    msgDiv.className = msg.sender === "user" ? "user-message" : "bot-message";

    if (showTimestamp) {
      const formattedTime = new Date(msg.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      msgDiv.setAttribute("data-time", formattedTime);
    }

    if (msg.message_type === "form_submission") {
      const formUI = createFormSubmissionUI(msg.message);
      msgDiv.appendChild(formUI);
    } else if (msg.message_type === "image") {
      msgDiv.classList.add("image-message");

      const img = document.createElement("img");
      img.src = msg.media_url;
      img.alt = "image";

      img.style.maxWidth = "120px";
      img.style.borderRadius = "10px";

      img.onclick = () => {
        window.open(msg.media_url, "_blank");
      };

      msgDiv.appendChild(img);
    } else {
      msgDiv.innerText = msg.message;
    }

    // structure (FIXED)
    contentWrapper.appendChild(senderName);
    contentWrapper.appendChild(msgDiv);

    row.appendChild(avatar);
    row.appendChild(contentWrapper);

    chatBox.appendChild(row);
  });
}

function scrollToBottom() {
  document.getElementById("scroll-bottom-btn").addEventListener("click", () => {
    chatBox.scrollTo({
      top: chatBox.scrollHeight,
      behavior: "smooth",
    });
  });
  chatBox.scrollTop = chatBox.scrollHeight;
}

function renderChatMessages() {
  getAllMessages();
  const chatBox = document.getElementById("chat-messages");

  const scrollBottomWrapper = document.getElementById("scroll-bottom-wrapper");
  const scrollTopWrapper = document.getElementById("load-previous");

  chatBox.addEventListener("scroll", () => {
    const isAtBottom =
      chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 10;

    scrollBottomWrapper.style.display = isAtBottom ? "none" : "block";
  });

  chatBox.addEventListener("scroll", () => {
    const isAtTop = chatBox.scrollTop > 120;

    scrollTopWrapper.style.display = isAtTop ? "none" : "block";
  });

  document.getElementById("scroll-bottom-btn").onclick = () => {
    chatBox.scrollTo({
      top: chatBox.scrollHeight,
      behavior: "smooth",
    });
  };

  if (!chatBox) return;

  // CLEAR OLD MESSAGES (IMPORTANT)
  chatBox.innerHTML = "";

  const messages = window.chatMessages || [];

  // SORT (optional but recommended)
  messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  messages.forEach((msg) => {
    const msgDiv = document.createElement("div");

    if (msg.sender === "user") {
      msgDiv.className = "user-message";
    } else if (msg.sender === "system") {
      msgDiv.className = "system-message";
    } else {
      msgDiv.className = "bot-message";
    }

    msgDiv.innerText = msg.message;

    chatBox.appendChild(msgDiv);
  });

  // chatBox.scrollTop = chatBox.scrollHeight;
}

function openStarterChat(text) {
  setScreen("chat");

  setTimeout(async () => {
    const chatMessages = document.getElementById("chat-messages");
    const quickReplies = document.getElementById("quick-replies");

    // remove welcome
    const welcomeMsg = document.getElementById("welcome-message");
    if (welcomeMsg) welcomeMsg.remove();

    // FIND STARTER
    const starter =
      window?.chatWidgetConfig?.widgetText?.conversationStarters?.find(
        (item) => item.text === text,
      );

    window.currentQuickActions = starter?.quickActions || [];

    // RENDER QUICK ACTIONS FIRST (UI first)
    if (starter?.quickActions?.length > 0) {
      quickReplies.innerHTML = starter.quickActions
        .slice(1)
        .map(
          (action) => `
        <button class="quick-reply-btn" onclick="sendMessage('${action.label}')">
          ${action.label}
        </button>
      `,
        )
        .join("");
    } else {
      quickReplies.innerHTML = "";
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;

    // LOGIC FOR ANSWER
    let answer = "";

    if (starter?.quickActions?.length > 0) {
      const firstAction = starter.quickActions[0];

      if (firstAction?.label === text) {
        answer = firstAction.value;
      }
    }

    try {
      // WAIT API (optional but safer)
      await sendActiveMessage({
        sender: "user",
        message: text,
        messageType: "quick_reply",
        meta: {
          replyValue: answer,
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // BOT MESSAGE
      await sendActiveMessage({
        sender: "bot",
        message: answer,
        messageType: "text",
      });
    } catch (err) {
      console.error("Error in starter flow:", err);
    }
  }, 50);
}

function renderFaqCards(conver) {
  const container = document.getElementById("faq-container");
  if (!conver) return;

  // filter enabled starters
  const enabledStarters = conver.filter((item) => item.enabled).slice(0, 5);

  enabledStarters.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "chat-card";

    if (index === 0) {
      card.classList.add("chat-card-first");
    }

    card.innerHTML = `
      <p class="chat-title">${item.text}</p>
    `;

    card.onclick = () => openStarterChat(item.text);

    container.appendChild(card);
  });
}
