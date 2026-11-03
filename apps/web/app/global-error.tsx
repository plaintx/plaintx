"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Replaces the whole page when the root layout fails, so it renders its own document. */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <title>PlainTx: something went wrong</title>
        <h1>Something went wrong</h1>
        <p>The page could not load. Please try again.</p>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  );
}
