import * as Sentry from "@sentry/nextjs";
import { DATA_COLLECTION, SENTRY_DSN } from "@/lib/sentry";

// Browser errors go to our own /monitoring route (next.config.ts), so the CSP stays 'self'.
if (SENTRY_DSN) {
  Sentry.init({ dsn: SENTRY_DSN, dataCollection: DATA_COLLECTION });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
