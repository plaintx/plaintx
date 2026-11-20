import { Tools } from "@/components/tools";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-6">
        <p className="text-sm font-semibold tracking-wide text-indigo-600 dark:text-indigo-400">
          PlainTx
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          Plain-English wallet safety checks
        </h1>
      </header>
      <Tools />
    </main>
  );
}
