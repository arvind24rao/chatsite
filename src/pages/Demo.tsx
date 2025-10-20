import React from "react";
import { Button } from "@/components/ui/button";

type Preview = {
  id: "A" | "B";
  title: string;
  content: string | null;
  loading: boolean;
};

type BusyState = "idle" | "sending" | "previewing" | "error" | "done";

export default function Demo() {
  const [text, setText] = React.useState<string>("");
  const [busy, setBusy] = React.useState<BusyState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [previews, setPreviews] = React.useState<Preview[]>([
    { id: "A", title: "Preview A", content: null, loading: false },
    { id: "B", title: "Preview B", content: null, loading: false },
  ]);

  const isBusy = busy === "sending" || busy === "previewing";

  const statusLabel = React.useMemo(() => {
    switch (busy) {
      case "idle":
        return "Idle";
      case "sending":
        return "Sending…";
      case "previewing":
        return "Generating previews…";
      case "done":
        return "Latest previews ready";
      case "error":
        return "Something went wrong";
      default:
        return "Idle";
    }
  }, [busy]);

  async function sendMessage() {
    if (!text.trim() || isBusy) return;
    setError(null);
    setBusy("sending");

    try {
      // 1) Send message to your API
      const res = await fetch("/api/send_message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`send_message ${res.status}`);

      // 2) Immediately request dry-run previews (A/B)
      setPreviews((prev) =>
        prev.map((p) => ({ ...p, content: null, loading: true }))
      );
      setBusy("previewing");

      const dry = await fetch("/api/bot/process?dry_run=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!dry.ok) throw new Error(`bot/process ${dry.status}`);

      // Expecting a shape like: { drafts: [string, string] }
      const data = (await dry.json()) as { drafts?: string[] };
      const a = data?.drafts?.[0] ?? "Draft A unavailable.";
      const b = data?.drafts?.[1] ?? "Draft B unavailable.";

      setPreviews([
        { id: "A", title: "Preview A", content: a, loading: false },
        { id: "B", title: "Preview B", content: b, loading: false },
      ]);

      setBusy("done");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setBusy("error");
      setPreviews((prev) => prev.map((p) => ({ ...p, loading: false })));
    }
  }

  function clearAll() {
    setText("");
    setError(null);
    setBusy("idle");
    setPreviews([
      { id: "A", title: "Preview A", content: null, loading: false },
      { id: "B", title: "Preview B", content: null, loading: false },
    ]);
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10">
      {/* Header */}
      <header className="max-w-5xl mx-auto flex items-center justify-between gap-4">
        <h1 className="text-3xl md:text-4xl font-semibold">
          Demo <span className="text-gradient-brand">preview</span>
        </h1>

        <StatusPill state={busy} label={statusLabel} />
      </header>

      {/* Input Card */}
      <section className="max-w-5xl mx-auto mt-8">
        <div className="card glow-brand">
          <label htmlFor="demo-input" className="block text-sm mb-2 text-neutral-400">
            Your message
          </label>
          <textarea
            id="demo-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write something thoughtful…"
            rows={5}
            className="w-full"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="glow-brand"
              onClick={sendMessage}
              disabled={!text.trim() || isBusy}
            >
              {isBusy ? "Working…" : "Send & preview"}
            </Button>

            <Button variant="outline" onClick={clearAll} disabled={isBusy}>
              Clear
            </Button>

            {error ? (
              <span className="text-red-400 text-sm ml-2">Error: {error}</span>
            ) : null}
          </div>
        </div>
      </section>

      {/* Previews */}
      <section className="max-w-5xl mx-auto mt-8 grid md:grid-cols-2 gap-6">
        {previews.map((p) => (
          <PreviewCard key={p.id} title={p.title} loading={p.loading} content={p.content} />
        ))}
      </section>

      {/* Hint / Footer */}
      <footer className="max-w-5xl mx-auto mt-10 text-center text-neutral-500 text-sm">
        The latest AI previews are shown above. Choose your final message in the next step.
      </footer>
    </main>
  );
}

/* ---------------------------
   Subcomponents
----------------------------*/

function StatusPill({ state, label }: { state: BusyState; label: string }) {
  const busy = state === "sending" || state === "previewing";
  const dotClass = busy ? "pulse-cyan" : "bg-neutral-500";
  const borderClass =
    state === "error"
      ? "border-red-500/50"
      : "border-brand-cyan-400/40";

  return (
    <div
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 border ${borderClass} bg-white/5`}
    >
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${dotClass}`}
        aria-hidden="true"
      />
      <span className="text-sm text-neutral-300">{label}</span>
    </div>
  );
}

function PreviewCard({
  title,
  loading,
  content,
}: {
  title: string;
  loading: boolean;
  content: string | null;
}) {
  return (
    <div className="card hover:glow-brand-lg transition-all">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-gradient-brand">{title}</h2>
        <span className="text-xs text-neutral-500">latest</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-4 rounded-md" />
          <div className="skeleton h-4 rounded-md w-11/12" />
          <div className="skeleton h-4 rounded-md w-10/12" />
          <div className="skeleton h-4 rounded-md w-9/12" />
        </div>
      ) : content ? (
        <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap">
          {content}
        </p>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-white/10 p-6 text-center">
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        className="mx-auto mb-2 opacity-70"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="9" className="text-brand-cyan-400/40" />
        <path d="M8 12h8M12 8v8" className="text-brand-cyan-400/70" />
      </svg>
      <p className="text-neutral-400 text-sm">
        Your preview will appear here after you send a message.
      </p>
    </div>
  );
}