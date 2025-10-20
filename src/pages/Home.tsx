import React from "react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6 py-16">
      {/* Hero Section */}
      <section className="text-center max-w-3xl space-y-6">
        <h1 className="text-6xl md:text-5xl font-semibold leading-tight">
          Conversations
          <br />
          <span className="text-gradient-brand">on your terms.</span>
        </h1>
        <p className="text-lg text-neutral-400 max-w-xl mx-auto">
          Loop helps you reconnect asynchronously — a calm, modern way to share
          and receive messages with the people who matter.
        </p>
        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <Button size="lg" className="glow-brand">
            Get Started
          </Button>
          <Button variant="outline" size="lg">
            View Demo
          </Button>
        </div>
      </section>

      {/* Decorative Rings */}
      <div className="relative mt-24 w-[280px] h-[280px]">
        <div className="absolute inset-0 rounded-full border border-brand-cyan-400/40" />
        <div className="absolute inset-6 rounded-full border border-brand-cyan-400/25" />
        <div className="absolute inset-12 rounded-full border border-brand-cyan-400/15" />
        <div className="absolute inset-20 rounded-full bg-brand-cyan-400/5 blur-2xl" />
      </div>

      {/* Features Section */}
      <section className="mt-32 max-w-4xl w-full grid md:grid-cols-3 gap-6 px-4">
        {[
          {
            title: "Async by design",
            text: "Slow down, think deeply, and express yourself when ready — not on the clock.",
          },
          {
            title: "Tone-safe summaries",
            text: "AI-crafted digests ensure clarity and warmth across all loops.",
          },
          {
            title: "Family analytics",
            text: "Understand group sentiment and engagement effortlessly.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="card hover:glow-brand-lg transition-all text-center"
          >
            <h2 className="text-2xl font-semibold mb-3 text-gradient-brand">
              {f.title}
            </h2>
            <p className="text-neutral-400 text-base leading-relaxed">
              {f.text}
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}