export function Footer() {
  return (
    <footer className="mt-auto w-full border-t border-line">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 text-[12.5px] text-muted md:px-8">
        <span>© 2026 Aparent</span>
        <nav className="flex gap-5">
          <a
            href="https://www.aparent.tv"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink"
          >
            aparent.tv
          </a>
          <a
            href="https://www.instagram.com/aparent.tv/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink"
          >
            Instagram
          </a>
        </nav>
      </div>
    </footer>
  );
}
