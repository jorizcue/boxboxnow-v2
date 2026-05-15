"use client";

import { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  Send,
  X,
  Loader2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";

import { api, streamChat } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { STORAGE_KEYS } from "@/lib/storage";

/**
 * Floating support chatbot widget — pinned bottom-right of `/dashboard`.
 *
 * - Streams the answer via SSE as the LLM emits tokens.
 * - Persists the conversation server-side under a `session_id` we save in
 *   localStorage so reopening the widget restores the history.
 * - "Nueva conversación" button resets to a fresh session.
 */

const STORAGE_KEY = STORAGE_KEYS.CHAT_SESSION;
const MAX_INPUT_CHARS = 800;

type Role = "user" | "assistant" | "error";

interface ChatTurn {
  role: Role;
  content: string;
  streaming?: boolean;
}

export function ChatWidget() {
  const _hydrated = useAuth((s) => s._hydrated);
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);

  const [open, setOpen] = useState(false);
  // Persisted launcher dismissal. Lazy-init from localStorage so the
  // bubble never flashes before an effect runs. Cleared on logout
  // (SESSION_BOUND_KEYS) ⇒ reappears next login.
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(STORAGE_KEYS.CHAT_HIDDEN) === "1";
    } catch {
      return false;
    }
  });
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore session id on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSessionId(saved);
    } catch {}
  }, []);

  // First time the panel opens with a known session, load history.
  useEffect(() => {
    if (!open || historyLoaded || !sessionId || !token) return;
    let cancelled = false;
    api
      .chatHistory(sessionId)
      .then((res) => {
        if (cancelled) return;
        if (res.messages.length > 0) {
          setTurns(
            res.messages.map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            })),
          );
        }
        setHistoryLoaded(true);
      })
      .catch(() => {
        // Non-fatal; just start with an empty conversation.
        setHistoryLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, historyLoaded, sessionId, token]);

  // Auto-scroll to the latest message when conversation grows.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, loading]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Auto-grow textarea up to ~5 lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  // Don't render until hydrated and only for logged-in users with chat access.
  if (!_hydrated) return null;
  if (!token || !user) return null;
  const allowed = user.is_admin || (user.tab_access || []).includes("chat");
  if (!allowed) return null;
  if (hidden) return null;

  function hideWidget() {
    setOpen(false);
    setHidden(true);
    try {
      localStorage.setItem(STORAGE_KEYS.CHAT_HIDDEN, "1");
    } catch {}
  }

  function resetConversation() {
    setTurns([]);
    setSessionId(null);
    setRemaining(null);
    setHistoryLoaded(true);   // an empty fresh session needs no fetch
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  async function send() {
    const question = input.trim();
    if (!question || loading) return;
    setInput("");

    // Append the user turn and an empty streaming assistant turn straight
    // away so the UI can update before the first token arrives.
    setTurns((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "", streaming: true },
    ]);
    setLoading(true);

    try {
      let activeSession = sessionId;
      for await (const event of streamChat(question, sessionId)) {
        if (event.type === "meta") {
          if (!activeSession) {
            activeSession = event.session_id;
            setSessionId(event.session_id);
            try { localStorage.setItem(STORAGE_KEY, event.session_id); } catch {}
          }
          setRemaining(event.remaining_today);
        } else if (event.type === "token") {
          setTurns((prev) => {
            const out = [...prev];
            const last = out[out.length - 1];
            if (last && last.role === "assistant" && last.streaming) {
              out[out.length - 1] = {
                ...last,
                content: last.content + event.content,
              };
            }
            return out;
          });
        } else if (event.type === "error") {
          setTurns((prev) => {
            const out = [...prev];
            // Replace the streaming-empty assistant turn with an error one.
            const lastIdx = out.length - 1;
            if (out[lastIdx]?.role === "assistant" && out[lastIdx]?.streaming) {
              out[lastIdx] = { role: "error", content: event.message };
            } else {
              out.push({ role: "error", content: event.message });
            }
            return out;
          });
        } else if (event.type === "done") {
          // Mark the last assistant turn as no longer streaming.
          setTurns((prev) => {
            const out = [...prev];
            const last = out[out.length - 1];
            if (last && last.role === "assistant") {
              out[out.length - 1] = { ...last, streaming: false };
            }
            return out;
          });
        }
      }
    } catch (err: any) {
      const msg = (err?.message || "").includes("429")
        ? "Has alcanzado el límite diario de mensajes. Inténtalo mañana."
        : "Error al contactar con el asistente. Inténtalo de nuevo.";
      setTurns((prev) => {
        const out = [...prev];
        const last = out[out.length - 1];
        if (last?.role === "assistant" && last?.streaming) {
          out[out.length - 1] = { role: "error", content: msg };
        } else {
          out.push({ role: "error", content: msg });
        }
        return out;
      });
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {!open && (
        <div className="fixed bottom-5 right-5 z-[90]">
          <button
            onClick={() => setOpen(true)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-black shadow-2xl shadow-black/50 transition-transform hover:scale-105 hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/60"
            aria-label="Abrir asistente"
          >
            <MessageCircle className="h-7 w-7" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              hideWidget();
            }}
            title="Ocultar asistente (vuelve al cerrar sesión)"
            aria-label="Ocultar asistente"
            className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-neutral-400 shadow-md transition-colors hover:bg-bg hover:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-[90] flex h-[min(640px,calc(100vh-2.5rem))] w-[min(420px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-accent/30 bg-surface shadow-2xl shadow-black/50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-accent" />
              <div>
                <div className="text-sm font-semibold text-muted">Asistente BoxBoxNow</div>
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">
                  Soporte sobre la app
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={resetConversation}
                disabled={loading || turns.length === 0}
                title="Nueva conversación"
                className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-bg hover:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
                aria-label="Nueva conversación"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-bg hover:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
                aria-label="Cerrar asistente"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {turns.length === 0 && (
              <EmptyState onPick={(q) => { setInput(q); inputRef.current?.focus(); }} />
            )}
            {turns.map((turn, i) => (
              <Bubble key={i} turn={turn} />
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-border bg-card px-3 py-2.5">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_CHARS))}
                onKeyDown={handleKey}
                placeholder="Pregunta cualquier duda sobre BoxBoxNow…"
                rows={1}
                className="flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-muted placeholder:text-neutral-600 focus:border-accent/50 focus:outline-none"
                disabled={loading}
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-black transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Enviar"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-600">
              <span>Enter envía · Shift+Enter salto de línea</span>
              {remaining !== null && (
                <span title="Mensajes que te quedan hoy">
                  {remaining} restantes hoy
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────── Bubble ───────────────────────

function Bubble({ turn }: { turn: ChatTurn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm text-black">
          {turn.content}
        </div>
      </div>
    );
  }
  if (turn.role === "error") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-tier-1/40 bg-tier-1/10 px-3 py-2 text-xs text-tier-1">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{turn.content}</span>
      </div>
    );
  }
  // assistant
  const empty = !turn.content;
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2 text-sm text-muted">
        {empty && turn.streaming ? (
          <span className="inline-flex items-center gap-2 text-neutral-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Pensando…
          </span>
        ) : (
          <>
            <Markdown text={turn.content} />
            {turn.streaming && <Caret />}
          </>
        )}
      </div>
    </div>
  );
}

function Caret() {
  return (
    <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-[2px] animate-pulse bg-accent/70" />
  );
}

// ─────────────────────── Empty state ───────────────────────

const SUGGESTIONS = [
  "¿Qué es la Clasif. Real?",
  "¿Cómo funciona el Box Score?",
  "¿Cuándo se abre la ventana de pit?",
];

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card px-3 py-3 text-sm text-muted">
        Hola. Soy tu asistente de soporte de <strong>BoxBoxNow</strong>. Puedo
        responder dudas sobre cómo usar la app, los módulos del panel y los
        conceptos de carrera. No tengo acceso al estado de tu sesión en
        directo.
      </div>
      <div className="space-y-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="block w-full rounded-md border border-border bg-bg px-3 py-1.5 text-left text-xs text-neutral-400 transition-colors hover:border-accent/40 hover:text-muted"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────── Tiny markdown renderer ───────────────────────

function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (b.type === "ul") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.items.map((it, j) => (
                <li key={j}><Inline text={it} /></li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {b.items.map((it, j) => (
                <li key={j}><Inline text={it} /></li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            <Inline text={b.text} />
          </p>
        );
      })}
    </div>
  );
}

type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

function parseBlocks(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push({ type: "ul", items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push({ type: "ol", items });
      continue;
    }

    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push({ type: "p", text: buf.join("\n") });
  }
  return out;
}

/** Renders bold (**x**), italic (*x* or _x_), and inline code. */
function Inline({ text }: { text: string }) {
  const parts: { kind: "text" | "bold" | "italic" | "code"; value: string }[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: "text", value: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) parts.push({ kind: "bold", value: tok.slice(2, -2) });
    else if (tok.startsWith("`")) parts.push({ kind: "code", value: tok.slice(1, -1) });
    else parts.push({ kind: "italic", value: tok.slice(1, -1) });
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });

  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "bold") return <strong key={i} className="font-semibold text-muted">{p.value}</strong>;
        if (p.kind === "italic") return <em key={i}>{p.value}</em>;
        if (p.kind === "code") return (
          <code key={i} className="rounded bg-bg px-1 py-0.5 font-mono text-[0.85em] text-accent">
            {p.value}
          </code>
        );
        return <span key={i}>{p.value}</span>;
      })}
    </>
  );
}
