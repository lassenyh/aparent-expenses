export function Footer() {
  return (
    <footer className="mt-auto w-full border-t border-neutral-800 bg-neutral-900/80 py-4 text-neutral-400">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 text-xs uppercase tracking-wide">
        <span className="text-neutral-400">© 2026 APARENT</span>
        <a
          href="https://www.aparent.tv"
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-300 hover:text-white transition-colors"
        >
          APARENT.TV
        </a>
        <a
          href="https://www.instagram.com/aparent.tv/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-300 hover:text-white transition-colors"
        >
          INSTAGRAM
        </a>
      </div>
    </footer>
  );
}
