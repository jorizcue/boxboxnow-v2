"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Loader2, AlertCircle } from "lucide-react";
import clsx from "clsx";

import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

/**
 * Floating support chatbot widget — pinned bottom-right of `/dashboard`.
 *
 * Single-turn RAG: every question is independent (no conversation memory
 * sent to the LLM yet). Messages are persisted server-side under a
 * `session_id` we generate client-side and store in localStorage so the
 * conversation survives reloads.
 */

const STORAGE_KEY = "boxboxnow-chat-session";
const MAX_INPUT_CHARS = 800;

type Role = "user" | "assistant" | "error";

interface ChatTurn {
  role: Role;
  content: string;
}

export function ChatWidget() {
  const _hydrated = useAuth((s) => s._hydrated);
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore session id on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSessionId(saved);
    } catch {}
  }, []);

  // Auto-scroll to the latest message when conversation changes.
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

  async function send() {
    const question = input.trim();
    if (!question || loading) return;
    setInput("");
    setTurns((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);
    try {
      const res = await api.chat(question, sessionId);
      if (!sessionId) {
        setSessionId(res.session_id);
        try { localStorage.setItem(STORAGE_KEY, res.session_id); } catch {}
      }
      setRemaining(res.remaining_today);
      setTurns((prev) => [...prev, { role: "assistant", content: res.answer }]);
    } catch (err: any) {
      const msg = (err?.message || "").includes("429")
        ? "Has alcanzado el límite diario de mensajes. Inténtalo mañana."
        : "Error al contactar con el asistente. Inténtalo de nuevo.";
      setTurns((prev) => [...prev, { role: "error", content: msg }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[90] flex h-14 w-14 items-center justify-center rounded-full bg-accent text-black shadow-2xl shadow-black/50 transition-transform hover:scale-105 hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/60"
          aria-label="Abrir asistente"
        >
          <MessageCircle className="h-7 w-7" />
        </button>
      )}

      {/* Chat panel */}
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
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-bg hover:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
              aria-label="Cerrar asistente"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {turns.length === 0 && (
              <EmptyState onPick={(q) => { setInput(q); inputRef.current?.focus(); }} />
            )}
            {turns.map((turn, i) => (
              <Bubble key={i} turn={turn} />
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Pensando…
              </div>
            )}
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
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2 text-sm text-muted">
        <Markdown text={turn.content} />
      </div>
    </div>
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
//
// Handles the formatting an LLM typically emits — bold (**x**), italic
// (*x* / _x_), inline code (`x`), bullet lists (- x), numbered lists
// (1. x) and paragraphs separated by blank lines. Avoids pulling
// react-markdown (would force a package-lock.json change).

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

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push({ type: "ul", items });
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push({ type: "ol", items });
      continue;
    }

    // Paragraph: collect until blank line
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
  // Tokenize on the supported markers, preserving order.
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
