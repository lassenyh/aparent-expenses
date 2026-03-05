export function Footer() {
  return (
    <footer className="mt-auto w-full border-t border-neutral-800 bg-neutral-900/80 py-4 text-neutral-400">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-1 px-4 text-[10px] uppercase tracking-wide md:flex-row md:items-center md:justify-between md:gap-0 md:px-6 md:text-xs">
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
          className="hidden text-neutral-300 hover:text-white transition-colors md:inline-block"
        >
          INSTAGRAM
        </a>
      </div>
    </footer>
  );
}
