// Configuration
const API_BASE_URL = window.location.origin.includes(":8000") 
    ? window.location.origin 
    : "http://localhost:8000";

// DOM Elements
const messagesFeed = document.getElementById("messages-feed");
const welcomeHero = document.getElementById("welcome-hero");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const topKSelect = document.getElementById("top-k-select");
const typingIndicator = document.getElementById("typing-indicator");
const statusDot = document.querySelector(".status-dot");
const statusText = document.getElementById("status-text");
const clearChatBtn = document.getElementById("clear-chat-btn");
const toast = document.getElementById("toast");

let isGenerating = false;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
    checkBackendHealth();
    setupEventListeners();
    setupAutoResize();
});

// Check API Connection
async function checkBackendHealth() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/health`, { method: "GET" });
        if (res.ok) {
            const data = await res.json();
            statusDot.classList.add("connected");
            statusDot.classList.remove("error");
            statusText.textContent = `Online • ${data.model || "Groq Llama 3.1"}`;
        } else {
            throw new Error("Backend not ready");
        }
    } catch (err) {
        statusDot.classList.remove("connected");
        statusDot.classList.add("error");
        statusText.textContent = "Backend offline (Run uvicorn)";
    }
}

// Event Listeners
function setupEventListeners() {
    // Form submit
    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleSubmit();
    });

    // Enter key to send, Shift+Enter for new line
    userInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });

    // Suggestion chips
    document.querySelectorAll(".suggestion-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
            const prompt = chip.getAttribute("data-prompt");
            if (prompt) {
                userInput.value = prompt;
                handleSubmit();
            }
        });
    });

    // Clear chat
    clearChatBtn.addEventListener("click", () => {
        messagesFeed.innerHTML = "";
        messagesFeed.appendChild(welcomeHero);
        welcomeHero.style.display = "block";
        userInput.value = "";
        showToast("Conversation cleared");
    });
}

// Auto-resize textarea
function setupAutoResize() {
    userInput.addEventListener("input", () => {
        userInput.style.height = "auto";
        userInput.style.height = Math.min(userInput.scrollHeight, 160) + "px";
    });
}

// Handle Form Submission
async function handleSubmit() {
    const question = userInput.value.trim();
    if (!question || isGenerating) return;

    // Hide welcome hero on first message
    if (welcomeHero && welcomeHero.parentNode === messagesFeed) {
        welcomeHero.style.display = "none";
    }

    // Append User Message
    appendUserMessage(question);

    // Reset input
    userInput.value = "";
    userInput.style.height = "auto";
    setLoadingState(true);

    const topK = parseInt(topKSelect.value, 10) || 5;

    try {
        const response = await fetch(`${API_BASE_URL}/api/ask`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, top_k: topK })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: "Unknown server error" }));
            throw new Error(errorData.detail || `Server responded with ${response.status}`);
        }

        const data = await response.json();
        appendAiMessage(data.answer, data.sources);
    } catch (error) {
        console.error("Query error:", error);
        appendErrorMessage(`Failed to get answer: ${error.message}. Please check if the FastAPI server is running on port 8000.`);
    } finally {
        setLoadingState(false);
    }
}

// Append User Message
function appendUserMessage(text) {
    const row = document.createElement("div");
    row.className = "message-row user";
    row.innerHTML = `
        <div class="avatar user-avatar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        </div>
        <div class="message-body">
            <div class="bubble">${escapeHtml(text)}</div>
            <div class="message-footer">
                <span>Just now</span>
            </div>
        </div>
    `;
    messagesFeed.appendChild(row);
    scrollToBottom();
}

// Append AI Message with Sources
function appendAiMessage(answer, sources = []) {
    const row = document.createElement("div");
    row.className = "message-row ai";

    let sourcesHtml = "";
    if (sources && sources.length > 0) {
        const sourceCards = sources.map((s, idx) => `
            <div class="source-card">
                <div class="source-card-header">
                    <span class="source-number">Chunk #${idx + 1} (Idx: ${s.index})</span>
                    <span class="source-distance">Distance: ${s.distance}</span>
                </div>
                <div class="source-text">${escapeHtml(s.text || "No text available")}</div>
            </div>
        `).join("");

        sourcesHtml = `
            <div class="sources-panel">
                <button type="button" class="sources-toggle">
                    <span>📚 Retrieved Context Sources (${sources.length})</span>
                    <span class="toggle-icon">▼</span>
                </button>
                <div class="sources-content">
                    ${sourceCards}
                </div>
            </div>
        `;
    }

    row.innerHTML = `
        <div class="avatar ai-avatar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
        </div>
        <div class="message-body">
            <div class="bubble">${formatMarkdown(answer)}</div>
            ${sourcesHtml}
            <div class="message-footer">
                <span>RAG • Groq Llama 3.1</span>
                <button class="btn-copy" title="Copy answer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Copy</span>
                </button>
            </div>
        </div>
    `;

    // Toggle sources accordion
    const toggleBtn = row.querySelector(".sources-toggle");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const panel = toggleBtn.closest(".sources-panel");
            panel.classList.toggle("open");
        });
    }

    // Copy button
    const copyBtn = row.querySelector(".btn-copy");
    if (copyBtn) {
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(answer).then(() => {
                showToast("Answer copied to clipboard!");
            }).catch(() => {
                showToast("Failed to copy text.");
            });
        });
    }

    messagesFeed.appendChild(row);
    scrollToBottom();
}

// Error Message
function appendErrorMessage(errorText) {
    const row = document.createElement("div");
    row.className = "message-row ai";
    row.innerHTML = `
        <div class="avatar ai-avatar" style="background: linear-gradient(135deg, #ef4444, #b91c1c);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
        </div>
        <div class="message-body">
            <div class="bubble" style="border-color: rgba(239, 68, 68, 0.4); color: #fca5a5;">
                ⚠️ ${escapeHtml(errorText)}
            </div>
        </div>
    `;
    messagesFeed.appendChild(row);
    scrollToBottom();
}

// UI Loading state
function setLoadingState(loading) {
    isGenerating = loading;
    sendBtn.disabled = loading;
    userInput.disabled = loading;

    if (loading) {
        typingIndicator.style.display = "flex";
        messagesFeed.appendChild(typingIndicator);
        scrollToBottom();
    } else {
        typingIndicator.style.display = "none";
        userInput.focus();
    }
}

// Simple Markdown Formatter
function formatMarkdown(text) {
    if (!text) return "";
    let safe = escapeHtml(text);
    // Bold **text**
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Inline code `code`
    safe = safe.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.08); padding: 2px 5px; border-radius: 4px; font-family: monospace;">$1</code>');
    // Code blocks ```...```
    safe = safe.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // Bullet points
    safe = safe.replace(/(?:^|\n)[*-]\s+(.+)/g, '<br>• $1');
    // Line breaks
    safe = safe.replace(/\n\n/g, '<br><br>');
    safe = safe.replace(/\n/g, '<br>');
    return safe;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.innerText = str;
    return div.innerHTML;
}

function scrollToBottom() {
    const container = document.querySelector(".chat-container");
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
    }, 50);
}

// Toast notification
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}
