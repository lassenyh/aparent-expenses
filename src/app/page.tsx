export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="max-w-lg text-center space-y-6">
        <h1 className="text-3xl font-semibold">
          Aparent Expenses
        </h1>

        <p className="text-sm text-gray-400 leading-relaxed">
          Denne siden brukes til å sende inn utlegg fra filmproduksjoner.
          Du vil normalt få tilsendt en unik lenke fra produsent hvor du
          kan laste opp kvitteringer og sende inn utlegg.
        </p>

        <p className="text-xs text-gray-500">
          Hvis du har fått en innsending-lenke, åpne den direkte.
        </p>
      </div>
    </main>
  );
}
