import { AppHeader } from "@/components/AppHeader";

export function AuthPanel({ title, description, children }: {
  title: string; description: string; children: React.ReactNode;
}) {
  return <main className="flex flex-col">
    <AppHeader />
    <div className="px-4 pb-12 pt-2 md:px-8 md:pt-6">
      <section className="mx-auto grid w-full max-w-[400px] gap-5 rounded-lg border border-line bg-surface p-7">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{title}</h1>
          <p className="text-sm leading-relaxed text-muted">{description}</p>
        </div>
        {children}
      </section>
    </div>
  </main>;
}
