"use client";

import { useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "subscribed" }
  | { kind: "unconfigured" }
  | { kind: "error"; message: string };

const CONTACT_EMAIL = "support@skillstechtalk.com";

const TEAM_SIZES = ["Just me", "2-10", "11-50", "50+"] as const;

const fieldClass =
  "w-full rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-haze-500 outline-none focus:border-gold-300/50";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [languages, setLanguages] = useState("");
  const [aiTooling, setAiTooling] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          teamSize: teamSize || undefined,
          languages: languages || undefined,
          aiTooling: aiTooling || undefined,
        }),
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
        <p className="text-lg font-semibold text-white">Request received.</p>
        <p className="mt-2 text-sm text-haze-300">
          Thanks, we will reach out about a pilot. In the meantime you can
          install ThunderLang from npm and try the gate on your own repo.
        </p>
      </div>
    );
  }

  if (state.kind === "unconfigured") {
    // Honest state: the backend is not wired up, so we did NOT store anything.
    const subject = encodeURIComponent("ThunderLang team pilot request");
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${encodeURIComponent(
      `Please contact ${email} about a ThunderLang team pilot.`,
    )}`;
    return (
      <div className="panel p-6 text-center">
        <p className="text-lg font-semibold text-white">Almost there.</p>
        <p className="mt-2 text-sm text-haze-300">
          Pilot intake storage isn&apos;t connected yet, so we didn&apos;t save
          your details. To make sure we get your request, send us a quick note:
        </p>
        <a href={mailto} className="btn-primary mt-4">
          Email {CONTACT_EMAIL}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-4">
      <div>
        <label
          htmlFor="pilot-email"
          className="mb-1.5 block text-sm font-medium text-haze-200"
        >
          Work email <span className="text-gold-300">*</span>
        </label>
        <input
          id="pilot-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className={fieldClass}
        />
      </div>

      <div>
        <label
          htmlFor="pilot-team-size"
          className="mb-1.5 block text-sm font-medium text-haze-200"
        >
          Team size <span className="text-haze-500">(optional)</span>
        </label>
        <select
          id="pilot-team-size"
          value={teamSize}
          onChange={(e) => setTeamSize(e.target.value)}
          className={`${fieldClass} appearance-none`}
        >
          <option value="" className="bg-ink-950">
            Select team size
          </option>
          {TEAM_SIZES.map((size) => (
            <option key={size} value={size} className="bg-ink-950">
              {size}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="pilot-languages"
          className="mb-1.5 block text-sm font-medium text-haze-200"
        >
          Primary languages <span className="text-haze-500">(optional)</span>
        </label>
        <input
          id="pilot-languages"
          type="text"
          value={languages}
          onChange={(e) => setLanguages(e.target.value)}
          placeholder="TypeScript, Python, Go ..."
          className={fieldClass}
        />
      </div>

      <div>
        <label
          htmlFor="pilot-ai-tooling"
          className="mb-1.5 block text-sm font-medium text-haze-200"
        >
          AI coding tools in use{" "}
          <span className="text-haze-500">(optional)</span>
        </label>
        <input
          id="pilot-ai-tooling"
          type="text"
          value={aiTooling}
          onChange={(e) => setAiTooling(e.target.value)}
          placeholder="Claude Code, Cursor, Copilot ..."
          className={fieldClass}
        />
      </div>

      <button
        type="submit"
        disabled={state.kind === "loading"}
        className="btn-primary w-full disabled:opacity-60"
      >
        {state.kind === "loading" ? "Sending…" : "Request a pilot"}
      </button>

      {state.kind === "error" && (
        <p className="text-sm text-red-300">{state.message}</p>
      )}
      <p className="text-xs text-haze-500">
        No spam. We&apos;ll only follow up about your pilot request. You can
        also reach us at{" "}
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
