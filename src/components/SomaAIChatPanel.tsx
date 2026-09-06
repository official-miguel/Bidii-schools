"use client";

/**
 * src/components/SomaAIChatPanel.tsx
 *
 * Soma AI conversational interface — the panel that slides in when the user
 * opens the assistant. Rendered as a portal by SomaAIProvider.
 *
 * Layout:
 *   - Side panel (lg+): fixed right rail, 420px wide, full viewport height
 *   - Bottom sheet (md): slides up from bottom, ~70vh
 *   - Full screen (sm and below): covers the entire screen
 *
 * Features:
 *   - Streaming responses with progressive rendering
 *   - Typing indicator while streaming
 *   - Markdown with code blocks, tables, lists
 *   - Copy / regenerate actions per message
 *   - Suggested follow-up chips
 *   - Timestamps on hover
 *   - Conversation clear
 *   - Keyboard shortcut (Escape closes)
 *   - Auto-scroll to new messages
 *   - Dark mode
 *   - Accessible (ARIA live region, focus management)
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  KeyboardEvent,
} from "react";
import {
  X,
  Send,
  RotateCcw,
  Copy,
  Check,
  Trash2,
  StopCircle,
  Sparkles,
  ChevronDown,
  AlertCircle,
  Settings,
} from "lucide-react";
import { useSomaAIStore, type SomaMessage } from "@/lib/soma-ai/store";
import { renderMarkdownStreaming, renderMarkdown } from "@/lib/soma-ai/markdown";

// ---------------------------------------------------------------------------
// Greeting / empty state
// ---------------------------------------------------------------------------

const GREETING_SUGGESTIONS = [
  "Show me this term's attendance summary",
  "How do I generate a report card?",
  "Draft a notice to parents about upcoming exams",
  "What does the CBE assessment framework mean?",
  "How do I add a new student to the system?",
  "Explain the grading scale for Form 3",
];

function EmptyState({
  role,
  onSuggest,
}: {
  role: string;
  onSuggest: (q: string) => void;
}) {
  const greetings: Record<string, { title: string; subtitle: string }> = {
    principal: {
      title: "Hi, I'm Soma AI",
      subtitle: "Your intelligent assistant for Bidii. Ask me anything about your school.",
    },
    teacher: {
      title: "Hi, I'm Soma AI",
      subtitle: "Ask me about attendance, marks, report cards, or any Bidii feature.",
    },
    staff: {
      title: "Hi, I'm Soma AI",
      subtitle: "I can help with student records, library, communications, and more.",
    },
    parent: {
      title: "Hi, I'm Soma AI",
      subtitle: "Ask me about your child's progress, attendance, or school events.",
    },
  };

  const { title, subtitle } = greetings[role] ?? greetings.principal;

  // Pick 4 random suggestions each render (stable per session)
  const suggestions = GREETING_SUGGESTIONS.slice(0, 4);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-10 text-center">
      {/* Logo mark */}
      <div
        className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal to-teal-dark
                   flex items-center justify-center mb-5 shadow-md"
      >
        <Sparkles className="w-7 h-7 text-white" />
      </div>

      <h2 className="text-lg font-semibold text-ink dark:text-dark-text mb-1.5">
        {title}
      </h2>
      <p className="text-sm text-slate dark:text-dark-muted max-w-xs leading-relaxed mb-8">
        {subtitle}
      </p>

      {/* Starter suggestions */}
      <div className="w-full max-w-sm space-y-2">
        {suggestions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onSuggest(q)}
            className="w-full text-left px-4 py-3 rounded-xl text-sm
                       border border-line hover:border-teal/40 hover:bg-teal-50
                       text-ink/80 dark:text-dark-text/80
                       dark:border-dark-border dark:hover:border-teal/40 dark:hover:bg-teal/10
                       transition-colors duration-100 leading-snug"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5" aria-label="Soma AI is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-teal/60 dark:bg-teal/50 animate-soma-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code block copy button (attaches to data-code attr injected by markdown.ts)
// ---------------------------------------------------------------------------

function useCodeCopyHandlers(containerRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handler(e: MouseEvent) {
      const btn = (e.target as Element)?.closest<HTMLButtonElement>(".soma-code-copy");
      if (!btn) return;
      const code = btn.getAttribute("data-code") ?? "";
      navigator.clipboard.writeText(code).catch(() => {});
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 2000);
    }

    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [containerRef]);
}

// ---------------------------------------------------------------------------
// Single message bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  onCopy,
  onRegenerate,
  isLast,
  isStreaming,
}: {
  message: SomaMessage;
  onCopy: () => void;
  onRegenerate?: () => void;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const [actionsVisible, setActionsVisible] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useCodeCopyHandlers(contentRef);

  const html = isAssistant
    ? message.streaming
      ? renderMarkdownStreaming(message.content)
      : renderMarkdown(message.content)
    : null;

  const formattedTime = new Date(message.timestamp).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`group relative flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
      onMouseEnter={() => setActionsVisible(true)}
      onMouseLeave={() => setActionsVisible(false)}
    >
      {/* Bubble */}
      <div
        className={`relative max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed
          ${isUser
            ? "bg-teal text-white rounded-tr-sm"
            : message.error
              ? "bg-danger-bg border border-danger/20 text-danger dark:bg-danger/10 dark:border-danger/20 dark:text-red-400 rounded-tl-sm"
              : "bg-white border border-line text-ink dark:bg-dark-surface dark:border-dark-border dark:text-dark-text rounded-tl-sm"
          }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : message.streaming && !message.content && (!message.activeTools || message.activeTools.length === 0) ? (
          /* Empty streaming bubble — show typing indicator */
          <TypingIndicator />
        ) : message.streaming && !message.content && message.activeTools && message.activeTools.length > 0 ? (
          /* Tool call in progress */
          <div className="flex items-center gap-2 text-xs text-teal">
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span>Checking live data…</span>
          </div>
        ) : (
          <div
            ref={contentRef}
            className="soma-prose"
            dangerouslySetInnerHTML={{ __html: html ?? "" }}
          />
        )}

        {/* Streaming cursor */}
        {isAssistant && message.streaming && message.content && (
          <span
            className="inline-block w-0.5 h-4 bg-teal ml-0.5 align-middle
                       animate-soma-cursor"
            aria-hidden="true"
          />
        )}

        {/* Error icon */}
        {message.error && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-danger/80">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Failed to respond</span>
          </div>
        )}
      </div>

      {/* Timestamp */}
      <span
        className={`text-[11px] text-slate/60 dark:text-dark-muted/60 px-1
                    transition-opacity duration-150
                    ${actionsVisible ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      >
        {formattedTime}
      </span>

      {/* Action buttons (assistant only, shown on hover) */}
      {isAssistant && !message.streaming && (
        <div
          className={`flex items-center gap-0.5 transition-opacity duration-150
                      ${actionsVisible ? "opacity-100" : "opacity-0"}`}
        >
          {/* Copy */}
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy message"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs
                       text-slate hover:text-ink hover:bg-paper
                       dark:text-dark-muted dark:hover:text-dark-text dark:hover:bg-dark-border
                       transition-colors"
          >
            {message.copied ? (
              <Check className="w-3 h-3 text-success" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span>{message.copied ? "Copied" : "Copy"}</span>
          </button>

          {/* Regenerate (last assistant msg only) */}
          {isLast && onRegenerate && !isStreaming && (
            <button
              type="button"
              onClick={onRegenerate}
              aria-label="Regenerate response"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs
                         text-slate hover:text-ink hover:bg-paper
                         dark:text-dark-muted dark:hover:text-dark-text dark:hover:bg-dark-border
                         transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          )}
        </div>
      )}

      {/* Suggested follow-ups */}
      {isAssistant && !message.streaming && message.suggestions && message.suggestions.length > 0 && (
        <SuggestionChips
          suggestions={message.suggestions}
          messageId={message.id}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggestion chips
// ---------------------------------------------------------------------------

function SuggestionChips({
  suggestions,
  messageId,
}: {
  suggestions: string[];
  messageId: string;
}) {
  const { sendMessage, dismissSuggestions } = useSomaAIStore();

  return (
    <div className="max-w-[88%] flex flex-wrap gap-1.5 mt-0.5">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => {
            dismissSuggestions(messageId);
            sendMessage(s);
          }}
          className="px-3 py-1.5 rounded-full text-xs font-medium
                     border border-teal/30 text-teal bg-teal-50
                     hover:bg-teal hover:text-white hover:border-teal
                     dark:bg-teal/10 dark:border-teal/30 dark:text-teal-light
                     dark:hover:bg-teal dark:hover:text-white
                     transition-colors duration-100"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config notice (when no Gemini key is set)
// ---------------------------------------------------------------------------

function ConfigNotice() {
  return (
    <div
      className="mx-4 my-2 px-4 py-3 rounded-xl
                 bg-warn-bg border border-warn/20 text-warn text-xs
                 flex items-start gap-2.5"
    >
      <Settings className="w-4 h-4 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium mb-0.5">Soma AI not configured</p>
        <p className="text-warn/80">
          Ask the Principal to add a Google Gemini API key under{" "}
          <span className="font-semibold">Settings → Integrations</span>.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scroll-to-bottom button
// ---------------------------------------------------------------------------

function ScrollToBottomButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Scroll to bottom"
      className="absolute bottom-20 right-4 w-9 h-9 rounded-full
                 bg-white border border-line shadow-md
                 flex items-center justify-center
                 hover:bg-paper text-slate hover:text-ink
                 dark:bg-dark-surface dark:border-dark-border
                 dark:text-dark-muted dark:hover:text-dark-text
                 transition-all duration-150 animate-fade-in z-10"
    >
      <ChevronDown className="w-4 h-4" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main panel component
// ---------------------------------------------------------------------------

export default function SomaAIChatPanel({ onClose }: { onClose: () => void }) {
  const {
    messages,
    isStreaming,
    inputDraft,
    sessionContext,
    setInputDraft,
    sendMessage,
    abortStream,
    regenerateLastResponse,
    copyMessage,
    clearHistory,
  } = useSomaAIStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Check if last assistant message had a config error
  const lastMsg = messages[messages.length - 1];
  const hasConfigError =
    lastMsg?.role === "assistant" &&
    lastMsg?.error &&
    lastMsg?.content?.includes("Settings → Integrations");

  // Auto-scroll to bottom when new content arrives
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "instant",
      block: "end",
    });
  }, []);

  useEffect(() => {
    if (isStreaming) scrollToBottom(false);
  }, [messages, isStreaming, scrollToBottom]);

  // Scroll to bottom on open
  useEffect(() => {
    setTimeout(() => scrollToBottom(false), 50);
  }, [scrollToBottom]);

  // Focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Show/hide scroll-to-bottom button
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    function onScroll() {
      const { scrollTop, scrollHeight, clientHeight } = container!;
      setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 120);
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  // Keyboard: Escape closes
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Submit
  function handleSubmit() {
    if (!inputDraft.trim() || isStreaming) return;
    sendMessage(inputDraft);
    setShowScrollBtn(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // Auto-resize textarea
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputDraft(e.target.value);
    // Reset height then set to scrollHeight
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }

  // Find the last assistant message for regenerate
  const lastAssistantIdx = [...messages].reverse().findIndex((m) => m.role === "assistant");
  const lastAssistantId =
    lastAssistantIdx !== -1
      ? messages[messages.length - 1 - lastAssistantIdx]?.id
      : null;

  return (
    <div
      role="dialog"
      aria-label="Soma AI Assistant"
      aria-modal="true"
      className="flex flex-col h-full bg-paper dark:bg-dark-bg overflow-hidden"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 h-14 shrink-0
                   border-b border-line dark:border-dark-border
                   bg-white dark:bg-dark-sidebar"
      >
        {/* Brand mark */}
        <div
          className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal to-teal-dark
                     flex items-center justify-center shrink-0"
        >
          <Sparkles className="w-4 h-4 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink dark:text-dark-text leading-none">
            Soma AI
          </p>
          <p className="text-[11px] text-slate dark:text-dark-muted mt-0.5 leading-none">
            {isStreaming ? (
              <span className="text-teal animate-pulse">Thinking…</span>
            ) : (
              "Bidii Intelligent Assistant"
            )}
          </p>
        </div>

        {/* Clear history */}
        {messages.length > 0 && (
          <div className="relative">
            {showClearConfirm ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate dark:text-dark-muted">Clear?</span>
                <button
                  type="button"
                  onClick={() => {
                    clearHistory();
                    setShowClearConfirm(false);
                  }}
                  className="text-xs font-medium text-danger hover:underline"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="text-xs text-slate dark:text-dark-muted hover:underline"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                aria-label="Clear conversation"
                className="w-8 h-8 flex items-center justify-center rounded-lg
                           text-slate hover:bg-paper hover:text-ink
                           dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text
                           transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Soma AI"
          className="w-8 h-8 flex items-center justify-center rounded-lg
                     text-slate hover:bg-paper hover:text-ink
                     dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text
                     transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Config warning (shown above messages, not blocking input) ───── */}
      {hasConfigError && <ConfigNotice />}

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain scroll-smooth
                   px-4 py-5 space-y-5"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.length === 0 ? (
          <EmptyState
            role={sessionContext.role}
            onSuggest={(q) => sendMessage(q)}
          />
        ) : (
          messages.map((msg, idx) => {
            const isLast = idx === messages.length - 1;
            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                onCopy={() => copyMessage(msg.id)}
                onRegenerate={
                  msg.id === lastAssistantId
                    ? regenerateLastResponse
                    : undefined
                }
                isLast={isLast}
                isStreaming={isStreaming}
              />
            );
          })
        )}
        <div ref={messagesEndRef} aria-hidden="true" />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <ScrollToBottomButton onClick={() => scrollToBottom(true)} />
      )}

      {/* ── Input area ──────────────────────────────────────────────────── */}
      <div
        className="shrink-0 px-4 pb-4 pt-3
                   border-t border-line dark:border-dark-border
                   bg-white dark:bg-dark-sidebar"
      >
        {/* Stop streaming button */}
        {isStreaming && (
          <button
            type="button"
            onClick={abortStream}
            className="w-full flex items-center justify-center gap-2 mb-2.5
                       py-2 rounded-lg text-xs font-medium
                       border border-danger/30 text-danger bg-danger-bg
                       hover:bg-danger hover:text-white
                       dark:bg-danger/10 dark:border-danger/30 dark:text-red-400
                       dark:hover:bg-danger dark:hover:text-white
                       transition-colors duration-100"
          >
            <StopCircle className="w-3.5 h-3.5" />
            Stop generating
          </button>
        )}

        {/* Textarea + send */}
        <div
          className="flex items-end gap-2 rounded-xl
                     border border-line bg-paper
                     dark:border-dark-border dark:bg-dark-surface
                     focus-within:border-teal/60 focus-within:ring-1 focus-within:ring-teal/20
                     transition-colors duration-100 px-3 py-2.5"
        >
          <textarea
            ref={inputRef}
            value={inputDraft}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask Soma AI anything…"
            rows={1}
            disabled={isStreaming}
            aria-label="Message input"
            className="flex-1 resize-none bg-transparent text-sm text-ink
                       dark:text-dark-text placeholder:text-slate/60
                       dark:placeholder:text-dark-muted/60
                       focus:outline-none leading-relaxed
                       disabled:opacity-50 max-h-40 min-h-[1.5rem]"
            style={{ height: "auto" }}
          />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!inputDraft.trim() || isStreaming}
            aria-label="Send message"
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
                       bg-teal text-white
                       hover:bg-teal-dark
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors duration-100"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="text-[11px] text-slate/50 dark:text-dark-muted/50 text-center mt-2">
          Enter to send · Shift+Enter for new line · Esc to close
        </p>
      </div>
    </div>
  );
}
