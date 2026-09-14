"use client";

/**
 * src/lib/soma-ai/store.ts
 *
 * Zustand store for Soma AI — manages the full conversation lifecycle:
 *   - Message history (persisted in sessionStorage so it survives page nav)
 *   - Streaming state with optimistic assistant bubble
 *   - Suggested follow-up questions
 *   - Session context (role, school, current page)
 *   - UI state (open/close, panel mode)
 *   - Abort controller so in-flight streams can be cancelled
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageRole = "user" | "assistant" | "system";

export interface SomaMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** ISO timestamp */
  timestamp: string;
  /** For assistant messages — true while streaming */
  streaming?: boolean;
  /** For assistant messages — true if an error occurred */
  error?: boolean;
  /** True when the error is a config issue (no key / disabled) — drives ConfigNotice */
  configIssue?: boolean;
  /** Suggested follow-up questions attached to this assistant message */
  suggestions?: string[];
  /** Whether the user has copied this message */
  copied?: boolean;
  /** Live tool calls currently in progress (shown as "Checking live data…") */
  activeTools?: string[];
}

export interface SessionContext {
  role: string;
  schoolName?: string;
  pagePath?: string;
  pageTitle?: string;
}

export type PanelMode =
  /** Desktop: right-side panel, ~420px wide */
  | "side"
  /** Mobile: full-screen overlay */
  | "fullscreen"
  /** Mobile: bottom sheet (partial height) */
  | "sheet";

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface SomaAIState {
  // ── Panel UI ──────────────────────────────────────────────────────────────
  isOpen: boolean;
  panelMode: PanelMode;

  // ── Conversation ──────────────────────────────────────────────────────────
  messages: SomaMessage[];
  isStreaming: boolean;
  inputDraft: string;

  // ── Context ───────────────────────────────────────────────────────────────
  sessionContext: SessionContext;

  // ── Abort ─────────────────────────────────────────────────────────────────
  abortController: AbortController | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  open: () => void;
  close: () => void;
  toggleOpen: () => void;
  setPanelMode: (mode: PanelMode) => void;

  setInputDraft: (draft: string) => void;
  setSessionContext: (ctx: Partial<SessionContext>) => void;

  sendMessage: (content: string) => void;
  abortStream: () => void;
  regenerateLastResponse: () => void;

  copyMessage: (id: string) => void;
  clearHistory: () => void;
  dismissSuggestions: (messageId: string) => void;
}

// ---------------------------------------------------------------------------
// ID generator
// ---------------------------------------------------------------------------

let _seq = 0;
function nextId() {
  return `soma-${Date.now()}-${++_seq}`;
}

// ---------------------------------------------------------------------------
// Session storage persistence (messages only)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "soma-ai-history";
const MAX_STORED_MESSAGES = 60;

function loadPersistedMessages(): SomaMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SomaMessage[];
    // Strip any messages that were mid-stream when the page closed
    return parsed
      .filter((m) => !m.streaming)
      .slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

function persistMessages(messages: SomaMessage[]) {
  if (typeof window === "undefined") return;
  try {
    const toStore = messages
      .filter((m) => !m.streaming)
      .slice(-MAX_STORED_MESSAGES);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // sessionStorage quota — not fatal
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSomaAIStore = create<SomaAIState>((set, get) => ({
  // ── Initial state ─────────────────────────────────────────────────────────
  isOpen: false,
  panelMode: "side",
  messages: loadPersistedMessages(),
  isStreaming: false,
  inputDraft: "",
  sessionContext: { role: "principal" },
  abortController: null,

  // ── Panel UI ──────────────────────────────────────────────────────────────
  open: () => set({ isOpen: true }),
  close: () => {
    get().abortStream();
    set({ isOpen: false });
  },
  toggleOpen: () => {
    const { isOpen } = get();
    if (isOpen) {
      get().abortStream();
      set({ isOpen: false });
    } else {
      set({ isOpen: true });
    }
  },
  setPanelMode: (mode) => set({ panelMode: mode }),

  // ── Input ─────────────────────────────────────────────────────────────────
  setInputDraft: (draft) => set({ inputDraft: draft }),

  // ── Context ───────────────────────────────────────────────────────────────
  setSessionContext: (ctx) =>
    set((s) => ({ sessionContext: { ...s.sessionContext, ...ctx } })),

  // ── Abort stream ──────────────────────────────────────────────────────────
  abortStream: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
      set({ abortController: null });
    }
    // Finalise any in-progress assistant bubble
    set((s) => ({
      isStreaming: false,
      messages: s.messages.map((m) =>
        m.streaming ? { ...m, streaming: false } : m
      ),
    }));
  },

  // ── Send message (triggers streaming fetch) ───────────────────────────────
  sendMessage: (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || get().isStreaming) return;

    const { messages, sessionContext } = get();

    // Optimistic user bubble
    const userMsg: SomaMessage = {
      id: nextId(),
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    // Empty streaming assistant bubble (shown immediately as typing indicator)
    const assistantMsgId = nextId();
    const assistantMsg: SomaMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      streaming: true,
    };

    const updatedMessages = [...messages, userMsg, assistantMsg];
    const controller = new AbortController();

    set({
      messages: updatedMessages,
      isStreaming: true,
      inputDraft: "",
      abortController: controller,
    });

    // Build history for API (exclude the new streaming placeholder)
    const historyForApi = messages
      .filter((m) => m.role !== "system" && !m.streaming && !m.error)
      .slice(-20)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Fire streaming request
    streamChat({
      message: trimmed,
      history: historyForApi,
      context: sessionContext,
      signal: controller.signal,
      onChunk: (chunk) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: m.content + chunk, activeTools: [] }
              : m
          ),
        }));
      },
      onToolCall: (toolName) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantMsgId
              ? { ...m, activeTools: [...(m.activeTools ?? []), toolName] }
              : m
          ),
        }));
      },
      onSuggestions: (suggestions) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantMsgId ? { ...m, suggestions } : m
          ),
        }));
      },
      onDone: () => {
        set((s) => {
          const updated = s.messages.map((m) =>
            m.id === assistantMsgId
              ? { ...m, streaming: false, activeTools: [], timestamp: new Date().toISOString() }
              : m
          );
          persistMessages(updated);
          return { isStreaming: false, abortController: null, messages: updated };
        });
      },
      onError: (error, configIssue) => {
        set((s) => {
          const updated = s.messages.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  streaming: false,
                  activeTools: [],
                  error: true,
                  configIssue: configIssue ?? false,
                  content: error,
                  suggestions: configIssue
                    ? ["How do I set up Soma AI?", "Where are the Integration Settings?"]
                    : ["Please try again", "Rephrase my question"],
                }
              : m
          );
          return { isStreaming: false, abortController: null, messages: updated };
        });
      },
    });
  },

  // ── Regenerate last response ───────────────────────────────────────────────
  regenerateLastResponse: () => {
    const { messages, isStreaming } = get();
    if (isStreaming) return;

    // Find last user message
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUserIdx === -1) return;
    const actualIdx = messages.length - 1 - lastUserIdx;
    const lastUserMsg = messages[actualIdx];

    // Drop everything after (and including) the last user message
    const trimmedMessages = messages.slice(0, actualIdx);
    set({ messages: trimmedMessages });

    // Re-send
    get().sendMessage(lastUserMsg.content);
  },

  // ── Copy message ──────────────────────────────────────────────────────────
  copyMessage: (id: string) => {
    const msg = get().messages.find((m) => m.id === id);
    if (!msg) return;
    navigator.clipboard.writeText(msg.content).catch(() => {});
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, copied: true } : m)),
    }));
    // Reset copied state after 2s
    setTimeout(() => {
      set((s) => ({
        messages: s.messages.map((m) => (m.id === id ? { ...m, copied: false } : m)),
      }));
    }, 2000);
  },

  // ── Clear history ─────────────────────────────────────────────────────────
  clearHistory: () => {
    get().abortStream();
    set({ messages: [], isStreaming: false });
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  },

  // ── Dismiss suggestions on a message ─────────────────────────────────────
  dismissSuggestions: (messageId: string) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, suggestions: [] } : m
      ),
    }));
  },
}));

// ---------------------------------------------------------------------------
// Streaming fetch helper
// ---------------------------------------------------------------------------

async function streamChat(opts: {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  context: SessionContext;
  signal: AbortSignal;
  onChunk: (text: string) => void;
  onToolCall: (toolName: string) => void;
  onSuggestions: (suggestions: string[]) => void;
  onDone: () => void;
  onError: (error: string, configIssue?: boolean) => void;
}) {
  try {
    const res = await fetch("/api/soma-ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify({
        message: opts.message,
        history: opts.history,
        context: opts.context,
      }),
    });

    // Non-streaming error (e.g. 401, 503 config issue)
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as {
        error?: string;
        configIssue?: boolean;
      };
      opts.onError(
        data.error ?? "Soma AI is unavailable right now. Please try again.",
        data.configIssue
      );
      return;
    }

    if (!res.body) {
      opts.onError("No response stream received.");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;

        try {
          const event = JSON.parse(raw) as {
            type: string;
            text?: string;
            tool?: string;
            suggestions?: string[];
            error?: string;
            configIssue?: boolean;
          };

          switch (event.type) {
            case "chunk":
              if (event.text) opts.onChunk(event.text);
              break;
            case "tool_call":
              if (event.tool) opts.onToolCall(event.tool);
              break;
            case "suggestions":
              if (event.suggestions) opts.onSuggestions(event.suggestions);
              break;
            case "done":
              opts.onDone();
              return;
            case "error":
              opts.onError(event.error ?? "An error occurred.", event.configIssue);
              return;
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    // Stream ended without a done event — still finalise
    opts.onDone();
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") {
      // User manually aborted — finalise whatever partial content exists
      opts.onDone();
      return;
    }
    opts.onError("Connection to Soma AI was lost. Please try again.");
  }
}
