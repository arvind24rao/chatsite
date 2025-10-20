import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Zap } from "lucide-react";
import { Api } from "@/api";
import { THREAD_ID, BOT_ID, USER_A_ID, USER_B_ID } from "@/config";

/** Clean trailing markers like "-AIOK" */
function cleanContent(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  return s.replace(/\s*-\s*AIOK\s*$/i, "").trim();
}

/** Pull latest previews to A/B from dry-run response */
function extractABPreviews(resp: any): { toA?: string; toB?: string } {
  const out: { toA?: string; toB?: string } = {};
  const items: any[] = Array.isArray(resp?.items) ? resp.items : [];

  // Iterate from newest to oldest
  for (let i = items.length - 1; i >= 0; i--) {
    const previews: any[] = Array.isArray(items[i]?.previews) ? items[i].previews : [];
    for (const p of previews) {
      const rid = p?.recipient_profile_id;
      const content = cleanContent(p?.content);
      if (!out.toA && rid === USER_A_ID && content) out.toA = content;
      if (!out.toB && rid === USER_B_ID && content) out.toB = content;
      if (out.toA && out.toB) return out;
    }
  }

  // If nothing matched, leave undefined so UI shows "No preview yet."
  return out;
}

export default function Demo() {
  const [aText, setAText] = useState("");
  const [bText, setBText] = useState("");
  const [previewA, setPreviewA] = useState<string>("");
  const [previewB, setPreviewB] = useState<string>("");
  const [busy, setBusy] = useState<"idle" | "sendingA" | "sendingB" | "previewing">("idle");
  const statusRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (statusRef.current) statusRef.current.textContent = busy === "idle" ? "idle" : busy;
  }, [busy]);

  const runPreview = async () => {
    setBusy("previewing");
    try {
      const resp = await Api.previewDryRun(THREAD_ID, BOT_ID);
      const { toA, toB } = extractABPreviews(resp);
      if (toA) setPreviewA(toA);
      if (toB) setPreviewB(toB);
    } catch (err: any) {
      console.error("preview failed:", err);
    } finally {
      setBusy("idle");
    }
  };

  const sendAs = async (who: "A" | "B") => {
    const userId = who === "A" ? USER_A_ID : USER_B_ID;
    const content = who === "A" ? aText.trim() : bText.trim();
    if (!content) return;

    setBusy(who === "A" ? "sendingA" : "sendingB");
    try {
      await Api.sendMessage({ thread_id: THREAD_ID, user_id: userId, content });
      // auto compute preview
      await runPreview();
      // clear input after sending
      if (who === "A") setAText("");
      else setBText("");
    } catch (err: any) {
      console.error(`send as ${who} failed:`, err);
    } finally {
      setBusy("idle");
    }
  };

  return (
    <div className="layout">
      {/* Sidebar */}
      <nav id="sidebar" aria-label="Primary" className="p-4 border-r border-border">
        <div className="brand font-bold mb-4">loop</div>
        <a className="navlink block px-3 py-2 rounded-lg hover:bg-muted" href="/">Home</a>
        <a className="navlink block px-3 py-2 rounded-lg hover:bg-muted" href="/demo">Demo</a>
      </nav>

      {/* Main */}
      <main className="p-6 w-full">
        <header className="flex items-center justify-between mb-4">
          <div>
            <div className="font-semibold text-lg">
              Demo Loop — Modern communication, reimagined
            </div>
            <div className="text-sm text-muted-foreground">
              Type as A or B. Sending auto-generates a calm, curated preview.
            </div>
          </div>
          <span ref={statusRef} className="statuspill inline-block px-3 py-1 rounded-full border border-border text-xs">
            idle
          </span>
        </header>

        {/* PREVIEWS ON TOP */}
        <section className="grid gap-4 md:grid-cols-2" aria-label="Previews">
          <section className="card rounded-xl border border-border bg-card">
            <h2 className="text-sm font-semibold px-4 py-3 border-b border-border">A’s message preview</h2>
            <div className="p-4">
              <div className="previewBox whitespace-pre-wrap rounded-lg border border-border bg-background/40 p-3 min-h-[64px]">
                {previewA ? previewA : <span className="text-muted-foreground">No preview yet.</span>}
              </div>
            </div>
          </section>

          <section className="card rounded-xl border border-border bg-card">
            <h2 className="text-sm font-semibold px-4 py-3 border-b border-border">B’s message preview</h2>
            <div className="p-4">
              <div className="previewBox whitespace-pre-wrap rounded-lg border border-border bg-background/40 p-3 min-h-[64px]">
                {previewB ? previewB : <span className="text-muted-foreground">No preview yet.</span>}
              </div>
            </div>
          </section>
        </section>

        {/* INPUTS BELOW */}
        <section className="grid gap-4 md:grid-cols-2 mt-4" aria-label="Inputs">
          {/* User A */}
          <section className="card rounded-xl border border-border bg-card">
            <h2 className="text-sm font-semibold px-4 py-3 border-b border-border">User A</h2>
            <div className="p-4">
              <div className="flex gap-2">
                <textarea
                  value={aText}
                  onChange={(e) => setAText(e.target.value)}
                  placeholder="Message as A…"
                  className="flex-1 min-h-[64px] rounded-lg border border-border bg-background/60 px-3 py-2 outline-none"
                />
                <Button
                  onClick={() => sendAs("A")}
                  disabled={busy !== "idle"}
                  className="shrink-0"
                  title="Send as A"
                >
                  <Send size={16} /> Send
                </Button>
              </div>
            </div>
          </section>

          {/* User B */}
          <section className="card rounded-xl border border-border bg-card">
            <h2 className="text-sm font-semibold px-4 py-3 border-b border-border">User B</h2>
            <div className="p-4">
              <div className="flex gap-2">
                <textarea
                  value={bText}
                  onChange={(e) => setBText(e.target.value)}
                  placeholder="Message as B…"
                  className="flex-1 min-h-[64px] rounded-lg border border-border bg-background/60 px-3 py-2 outline-none"
                />
                <Button
                  onClick={() => sendAs("B")}
                  disabled={busy !== "idle"}
                  className="shrink-0"
                  title="Send as B"
                >
                  <Send size={16} /> Send
                </Button>
              </div>
            </div>
          </section>
        </section>

        {/* Footer note */}
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Zap size={14} />
          <span>Preview computes automatically after each send.</span>
          <span className="opacity-60">Thread:</span>
          <code className="opacity-60">{THREAD_ID}</code>
        </div>
      </main>
    </div>
  );
}