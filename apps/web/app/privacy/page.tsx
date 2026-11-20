import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy: PlainTx",
  description: "What PlainTx stores, for how long, and who else sees it.",
};

/** Changed whenever the facts below change. Every statement here must match the code. */
const UPDATED = "20 November 2026";

const CONTACT = "hello@plaintx.app";

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <p className="text-sm font-semibold tracking-wide text-indigo-600 dark:text-indigo-400">
        <Link href="/" className="hover:underline">
          PlainTx
        </Link>
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-zinc-500">Last updated {UPDATED}</p>

      <div className="mt-8 space-y-8 text-sm leading-6 text-zinc-700 dark:text-zinc-300 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-zinc-900 dark:[&_h2]:text-zinc-100 [&_li]:ml-5 [&_li]:list-disc">
        <section>
          <h2>In short</h2>
          <ul className="space-y-1">
            <li>No accounts, no cookies, no analytics, no ads, no tracking.</li>
            <li>We never ask for, see or store your seed phrase or private keys.</li>
            <li>
              Wallet addresses are public on the blockchain. We keep the approval history of wallets
              you check, so the next check is fast. We don't link it to you.
            </li>
            <li>Your IP address is kept for at most 10 minutes, only to stop abuse.</li>
          </ul>
        </section>

        <section>
          <h2>What you enter</h2>
          <p>
            When you check a wallet, its address goes to our server, which asks Etherscan and
            Alchemy (blockchain data providers) about it. They see the wallet address and our
            server, not you. We store the wallet's approval history and facts about the apps it
            approved in our database, so later checks are faster. This holds no IP address, name or
            anything else about who asked. We delete a wallet's cached history after 90 days without
            a check.
          </p>
          <p className="mt-2">
            When you check a signature request, it is checked and then discarded. We don't store or
            log it.
          </p>
        </section>

        <section>
          <h2>Your IP address</h2>
          <p>
            To stop one person from using up the service for everyone, we count checks per IP
            address (per /64 block for IPv6) in Redis. Each count deletes itself within 10 minutes.
            Our host, Vercel, also handles your IP address to deliver the website, under its own
            privacy policy.
          </p>
        </section>

        <section>
          <h2>Errors</h2>
          <p>
            When something breaks, an error report goes to Sentry (EU, Germany) so we can fix it. We
            configure it to send no IP address, no headers, no cookies and nothing you entered, and
            we remove our own keys from the reports before they are sent.
          </p>
        </section>

        <section>
          <h2>Connecting a wallet</h2>
          <p>
            Connecting a wallet is optional and only needed to remove approvals. Your wallet signs
            and sends the transaction itself. Your browser remembers which wallet you connected, in
            its own local storage. To follow the transaction, your browser talks to the networks'
            public RPC endpoints directly.
          </p>
        </section>

        <section>
          <h2>Where data is kept</h2>
          <p>
            Our servers, database (Neon) and Redis (Upstash) run in Frankfurt, Germany. Etherscan
            and Alchemy may process requests elsewhere.
          </p>
        </section>

        <section>
          <h2>Questions or deletion</h2>
          <p>
            Write to{" "}
            <a className="font-medium hover:underline" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            . We can delete the cached history of a wallet address on request. PlainTx is open
            source: you can read exactly what the code does on{" "}
            <a
              className="font-medium hover:underline"
              href="https://github.com/plaintx/plaintx"
              rel="noreferrer"
              target="_blank"
            >
              GitHub
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
