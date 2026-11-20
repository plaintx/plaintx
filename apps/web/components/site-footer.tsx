import Link from "next/link";

/** On every page: where to read the code, how we handle data, and how to report a problem. */
export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-3xl px-4 pb-10 text-xs text-zinc-500">
      <nav
        aria-label="Footer"
        className="flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-200 pt-4 dark:border-zinc-800"
      >
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
        <a
          href="https://github.com/plaintx/plaintx"
          rel="noreferrer"
          target="_blank"
          className="hover:underline"
        >
          Source code (MIT)
        </a>
        <a href="mailto:hello@plaintx.app" className="hover:underline">
          Feedback: hello@plaintx.app
        </a>
        <a href="mailto:security@plaintx.app" className="hover:underline">
          Report a security issue
        </a>
      </nav>
      <p className="mt-2">
        PlainTx gives information, not guarantees. "No known risks found" means our checks found
        nothing, not that nothing can go wrong.
      </p>
    </footer>
  );
}
