import { NextResponse } from "next/server";

import { processUnsubscribe } from "@/server/services/unsubscribe";

/**
 * RFC 8058 one-click unsubscribe endpoint.
 * Gmail/Yahoo POST here with body `List-Unsubscribe=One-Click`.
 * GET redirects to the human-readable unsubscribe page.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();

  if (!token) {
    return new Response(null, { status: 400 });
  }

  // Attempt unsubscribe; always return 2xx so mail clients do not retry.
  try {
    await processUnsubscribe(token);
  } catch {
    // Token was present; swallow infrastructure errors per RFC 8058.
  }

  return new Response(null, { status: 200 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  const destination = new URL("/unsubscribe", url.origin);

  if (token) {
    destination.searchParams.set("token", token);
  }

  return NextResponse.redirect(destination, 302);
}
