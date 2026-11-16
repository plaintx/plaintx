import * as Sentry from "@sentry/nextjs";

/** Starts error reporting when the server starts. Every route runs on Node.js. See ADR 0014. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server");
}

/** Errors no route caught: rendering, route handlers and the proxy. */
export const onRequestError = Sentry.captureRequestError;
