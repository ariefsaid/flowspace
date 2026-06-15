import Link from "next/link";
import { Clock, Users, Monitor, Coffee, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Shared link-button class builders (Button primitive is <button>-only)
// ---------------------------------------------------------------------------

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 text-sm";

const btnVariants = {
  // "Mulai Sekarang" on the teal hero — translucent ghost pill with white border
  heroGhost:
    "border border-white/40 bg-white/10 text-white hover:bg-white/20 h-11 px-5",
  // "Masuk Member" — solid white button with dark text
  heroSolidWhite:
    "bg-white text-gray-900 hover:bg-white/90 shadow-sm h-11 px-5",
  // "Order Cafe sebagai Guest" — orange gradient pill
  accent:
    "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md hover:from-orange-600 hover:to-orange-600 h-11 px-5",
};

// ---------------------------------------------------------------------------
// Feature cards data (3 cards, single row)
// ---------------------------------------------------------------------------

const features = [
  {
    icon: Clock,
    iconBg: "bg-teal-500",
    iconColor: "text-white",
    title: "Kredit Waktu",
    desc: "Beli paket jam dan gunakan secara fleksibel di semua fasilitas.",
  },
  {
    icon: Users,
    iconBg: "bg-orange-500",
    iconColor: "text-white",
    title: "Ruang Meeting",
    desc: "2 ruang meeting lengkap untuk 8-10 orang per ruangan.",
  },
  {
    icon: Monitor,
    iconBg: "bg-blue-500",
    iconColor: "text-white",
    title: "Ruang Coworking",
    desc: "10 kursi coworking dengan internet berkecepatan tinggi.",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* 1. Hero                                                              */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-gradient-to-br from-teal-500 to-teal-600 px-4 py-20 text-white">
        <div className="container mx-auto max-w-4xl text-center">
          {/* Pill badge */}
          <div className="mb-6 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
              ✦ Solusi Ruang Kerja Pintar
            </span>
          </div>

          {/* Heading */}
          <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Kerja, Meeting &amp; <span className="text-orange-400">Ngopi</span>
          </h1>

          {/* Subheading */}
          <p className="mx-auto mb-8 max-w-xl text-base text-white/85 sm:text-lg">
            Pengalaman coworking terintegrasi dengan cafe, ruang meeting, dan
            sistem kredit waktu yang fleksibel.
          </p>

          {/* Primary CTAs */}
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={cn(btnBase, btnVariants.heroGhost)}>
              Mulai Sekarang
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/login"
              className={cn(btnBase, btnVariants.heroSolidWhite)}
            >
              Masuk Member
            </Link>
          </div>

          {/* Guest CTA */}
          <p className="mt-8 mb-4 text-sm text-white/80">
            Hanya ingin memesan makanan &amp; minuman?
          </p>
          <div className="flex justify-center">
            <Link href="/cafe/guest" className={cn(btnBase, btnVariants.accent)}>
              <Coffee className="h-4 w-4" aria-hidden />
              Order Cafe sebagai Guest
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Features                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-white px-4 py-20">
        <div className="container mx-auto max-w-5xl">
          {/* Section header */}
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold text-gray-900">
              Semua yang Anda Butuhkan
            </h2>
            <p className="text-base text-gray-500">
              Dari ruang kerja fleksibel hingga kopi nikmat, semua tersedia
              untuk Anda.
            </p>
          </div>

          {/* Feature grid — 3 columns */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <Card key={f.title} className="p-6">
                  <div
                    className={cn(
                      "mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl",
                      f.iconBg,
                    )}
                  >
                    <Icon className={cn("h-5 w-5", f.iconColor)} aria-hidden />
                  </div>
                  <h3 className="mb-1.5 text-base font-semibold text-gray-800">
                    {f.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-gray-500">
                    {f.desc}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Orange CTA band (solid, no copy — matches original)               */}
      {/* ------------------------------------------------------------------ */}
      <section
        aria-hidden
        className="bg-gradient-to-r from-orange-500 to-orange-600 py-28"
      />
    </>
  );
}
