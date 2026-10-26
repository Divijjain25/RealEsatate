import Link from "next/link";

const FEATURES = [
  {
    title: "Every lead in one place",
    body: "99acres, MagicBricks, walk-ins, referrals and WhatsApp enquiries, in one list your whole team shares.",
  },
  {
    title: "No missed follow-ups",
    body: "Today's calls and overdue follow-ups are waiting for you every morning.",
  },
  {
    title: "Know who to call first",
    body: "Hot, warm and cold leads, matched to the properties you have in stock.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-12">
      <nav className="mb-16 flex items-center justify-between">
        <span className="text-lg font-semibold text-emerald-800">RealEstate LeadOS</span>
        <Link href="/login" className="text-sm font-medium text-emerald-700 hover:underline">
          Log in
        </Link>
      </nav>

      <section className="mb-16 max-w-2xl">
        <h1 className="mb-4 text-4xl font-semibold leading-tight text-slate-900">
          Every lead in one place. Every follow-up on time.
        </h1>
        <p className="mb-8 text-lg text-slate-600">
          Lead management and follow-up reminders built for Indian real-estate agents and agencies.
        </p>
        <Link
          href="/signup"
          className="inline-block rounded-lg bg-emerald-700 px-6 py-3 font-medium text-white hover:bg-emerald-800"
        >
          Start free pilot
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 font-semibold text-slate-900">{feature.title}</h2>
            <p className="text-sm text-slate-600">{feature.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
