import * as Sentry from "@sentry/nextjs";
import { redactSecrets, secretValues } from "@/lib/redact";
import { DATA_COLLECTION, SENTRY_DSN } from "@/lib/sentry";

if (SENTRY_DSN) {
  // Provider URLs and keys are scrubbed from every event, in case an error message quotes one.
  const secrets = secretValues(process.env);
  Sentry.init({
    dsn: SENTRY_DSN,
    dataCollection: DATA_COLLECTION,
    beforeSend: (event) => redactSecrets(event, secrets),
  });
}
