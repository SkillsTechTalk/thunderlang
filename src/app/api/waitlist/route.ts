import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { put } from "@vercel/blob";

/**
 * Waitlist intake endpoint. This performs a REAL signup capture, in priority
 * order:
 *
 *  1. If a Vercel Blob store is connected (BLOB_READ_WRITE_TOKEN present), each
 *     signup is stored as a private JSON object keyed by a hash of the email,
 *     so re-submitting the same address is idempotent (no duplicates).
 *  2. Else if WAITLIST_WEBHOOK_URL is set, the email is forwarded there.
 *  3. Else we honestly report "unconfigured" so the UI can ask the visitor to
 *     email us directly. We never pretend an address was stored.
 *
 * The Blob store is provisioned and linked to the Vercel project, so signups
 * persist in production automatically. To read them: `vercel blob list`.
 */

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let email = "";
  try {
    const body = await request.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json(
      { status: "error", message: "Invalid request body." },
      { status: 400 },
    );
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { status: "error", message: "Please enter a valid email address." },
      { status: 422 },
    );
  }

  // 1. Persist to Vercel Blob when available.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const key = createHash("sha256").update(email).digest("hex").slice(0, 32);
      await put(
        `waitlist/${key}.json`,
        JSON.stringify({ email, ts: new Date().toISOString(), source: "web" }),
        {
          access: "private", // store is private; emails are never publicly readable
          contentType: "application/json",
          addRandomSuffix: false,
          allowOverwrite: true, // idempotent: same email overwrites its record
        },
      );
      return NextResponse.json({ status: "subscribed" });
    } catch {
      return NextResponse.json(
        { status: "error", message: "We couldn't save your signup right now." },
        { status: 502 },
      );
    }
  }

  // 2. Fall back to a configured webhook.
  const webhook = process.env.WAITLIST_WEBHOOK_URL;
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, source: "intentlanguage.dev/waitlist" }),
      });
      if (!res.ok) {
        return NextResponse.json(
          { status: "error", message: "We couldn't add you right now." },
          { status: 502 },
        );
      }
      return NextResponse.json({ status: "subscribed" });
    } catch {
      return NextResponse.json(
        { status: "error", message: "We couldn't reach the waitlist service." },
        { status: 502 },
      );
    }
  }

  // 3. Nothing configured: be honest, store nothing.
  return NextResponse.json({
    status: "unconfigured",
    message:
      "Waitlist storage is not configured yet, so we did not save your address.",
  });
}
