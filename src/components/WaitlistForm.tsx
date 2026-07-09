"use client";

import { useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "subscribed" }
  | { kind: "unconfigured" }
  | { kind: "error"; message: string };

const CONTACT_EMAIL = "hello@intentlanguage.dev";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.status === "subscribed") setState({ kind: "subscribed" });
      else if (data.status === "unconfigured")
        setState({ kind: "unconfigured" });
      else
        setState({
          kind: "error",
          message: data.message ?? "Something went wrong.",
        });
    } catch {
      setState({
        kind: "error",
        message: "Network error. Please try again.",
      });
    }
  }

  if (state.kind === "subscribed") {
    return (
      <div className="panel p-6 text-center">
        <p className="text-lg font-semibold text-white">You&apos;re on the list.</p>
        <p className="mt-2 text-sm text-haze-300">
          Thanks for your interest in Intent. We&apos;ll be in touch as docs,
          examples, and early access become available.
        </p>
      </div>
    );
  }

  if (state.kind === "unconfigured") {
    // Honest state: the backend is not wired up, so we did NOT store anything.
    const subject = encodeURIComponent("Add me to the Intent waitlist");
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${encodeURIComponent(
      `Please add ${email} to the waitlist.`,
    )}`;
    return (
      <div className="panel p-6 text-center">
        <p className="text-lg font-semibold text-white">Almost there.</p>
        <p className="mt-2 text-sm text-haze-300">
          Waitlist storage isn&apos;t connected yet, so we didn&apos;t save your
          address. To make sure you&apos;re added, send us a quick note:
        </p>
        <a href={mailto} className="btn-primary mt-4">
          Email {CONTACT_EMAIL}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="waitlist-email" className="sr-only">
          Email address
        </label>
        <input
          id="waitlist-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="flex-1 rounded-full border border-white/12 bg-white/[0.03] px-5 py-3 text-sm text-white placeholder:text-haze-500 outline-none focus:border-gold-300/50"
        />
        <button
          type="submit"
          disabled={state.kind === "loading"}
          className="btn-primary disabled:opacity-60"
        >
          {state.kind === "loading" ? "Joining…" : "Join the Waitlist"}
        </button>
      </div>
      {state.kind === "error" && (
        <p className="mt-3 text-sm text-red-300">{state.message}</p>
      )}
      <p className="mt-3 text-xs text-haze-500">
        No spam. We&apos;ll only email about Intent milestones. You can also reach
        us at{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-gold-300 hover:text-gold-200"
        >
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </form>
  );
}
