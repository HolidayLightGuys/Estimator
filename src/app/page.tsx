import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-hlg-green to-hlg-green-bright">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="hlg-card p-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-hlg-red mb-4">
            <span className="text-hlg-gold text-2xl">✦</span>
          </div>
          <h1 className="text-3xl font-bold text-hlg-charcoal">
            Holiday Light Guys — Estimator
          </h1>
          <p className="mt-2 text-neutral-600">
            Internal tool for preparing Christmas light installation estimates from Workiz leads.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/estimator"
              className="px-6 py-3 rounded-lg bg-hlg-red text-white font-semibold shadow-card hover:bg-hlg-red-dark transition-colors"
            >
              Open Estimator
            </Link>
          </div>

          <p className="mt-8 text-xs text-neutral-400">
            Internal tool — not indexed, not linked from the public site.
          </p>
        </div>
      </div>
    </main>
  );
}
