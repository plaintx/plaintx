import { HealthCheck } from "@/components/health-check";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-8">
        <p className="text-sm font-semibold tracking-wide text-indigo-600 dark:text-indigo-400">
          PlainTx
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Wallet health check</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          See which apps can spend your tokens and NFTs, riskiest first, and remove the ones you
          don't need. We never ask for your seed phrase or private key: revoking happens in your own
          wallet.
        </p>
      </header>
      <HealthCheck />
    </main>
  );
}
