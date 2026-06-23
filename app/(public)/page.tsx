import Link from "next/link";
import {
  Clock,
  Users,
  Monitor,
  Printer,
  QrCode,
  Percent,
  Coffee,
  ArrowRight,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
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
  // White outline button for CTA band
  ctaWhite:
    "border-2 border-white bg-white text-orange-700 hover:bg-white/90 shadow-md h-11 px-6",
  // Teal solid for membership CTA
  primary:
    "bg-teal-500 text-white hover:bg-teal-600 shadow-sm h-10 px-5 w-full",
};

// ---------------------------------------------------------------------------
// Feature cards data — all 6 (OBS-003)
// ---------------------------------------------------------------------------

const features = [
  {
    icon: Clock,
    iconBg: "bg-teal-500",
    title: "Kredit Waktu",
    desc: "Beli paket jam dan gunakan secara fleksibel di semua fasilitas.",
  },
  {
    icon: Users,
    iconBg: "bg-orange-500",
    title: "Ruang Meeting",
    desc: "2 ruang meeting lengkap untuk 8-10 orang per ruangan.",
  },
  {
    icon: Monitor,
    iconBg: "bg-blue-500",
    title: "Ruang Coworking",
    desc: "10 kursi coworking dengan internet berkecepatan tinggi.",
  },
  {
    icon: Printer,
    iconBg: "bg-purple-500",
    title: "Layanan Print",
    desc: "Print terintegrasi PaperCut dengan top-up mudah.",
  },
  {
    icon: QrCode,
    iconBg: "bg-teal-600",
    title: "Akses Digital",
    desc: "QR code dinamis sebagai kartu akses fasilitas yang aman.",
  },
  {
    icon: Percent,
    iconBg: "bg-green-500",
    title: "Diskon Cafe",
    desc: "Penyewa aktif mendapat diskon di cafe kami.",
  },
];

// ---------------------------------------------------------------------------
// Membership tiers (OBS-004) — white-labeled per ADR-0002
// ---------------------------------------------------------------------------

type TierBenefit = string;

interface MembershipTier {
  name: string;
  tagline: string;
  description: string;
  popular?: boolean;
  benefits: TierBenefit[];
}

const membershipTiers: MembershipTier[] = [
  {
    name: "Regular",
    tagline: "Standar",
    description: "Membership dasar tanpa diskon",
    benefits: ["Akses semua fasilitas", "Sistem kredit waktu"],
  },
  {
    name: "Premium",
    tagline: "Diskon hingga 50%",
    description: "Akses penuh dengan diskon premium",
    benefits: [
      "Akses semua fasilitas",
      "Sistem kredit waktu",
      "Diskon coworking 50%",
      "Diskon meeting room 50%",
      "Diskon cafe 5%",
      "Diskon print 20%",
    ],
  },
  {
    name: "Gold Member",
    tagline: "Diskon hingga 10%",
    description: "Paket eksklusif dengan berbagai keuntungan",
    popular: true,
    benefits: [
      "Akses semua fasilitas",
      "Sistem kredit waktu",
      "Diskon coworking 10%",
      "Diskon meeting room 10%",
      "Diskon cafe 5%",
      "Diskon print 5%",
    ],
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
      <section className="bg-gradient-to-br from-teal-800 to-teal-900 px-4 py-20 text-white">
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
          <p className="mb-4 mt-8 text-sm text-white/80">
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
      {/* 2. Features — 6 cards (OBS-003)                                     */}
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

          {/* Feature grid — 2 cols on sm, 3 cols on lg */}
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
                    <Icon className="h-5 w-5 text-white" aria-hidden />
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
      {/* 3. Membership tiers (OBS-004)                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-slate-50 px-4 py-20">
        <div className="container mx-auto max-w-5xl">
          {/* Section header */}
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold text-gray-900">
              Paket Membership
            </h2>
            <p className="text-base text-gray-500">
              Pilih paket yang sesuai kebutuhan Anda. Semua member menikmati
              ekosistem terintegrasi kami.
            </p>
          </div>

          {/* Tier cards */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {membershipTiers.map((tier) => (
              <Card
                key={tier.name}
                variant={tier.popular ? "highlight" : "default"}
                className="relative flex flex-col p-6"
              >
                {/* Popular badge */}
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge tone="active">Paling Populer</Badge>
                  </div>
                )}

                {/* Tier name + tagline */}
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-gray-900">
                    {tier.name}
                  </h3>
                  <p className="mt-0.5 text-sm font-medium text-teal-600">
                    {tier.tagline}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {tier.description}
                  </p>
                </div>

                {/* Benefits list */}
                <ul className="mb-6 flex-1 space-y-2" aria-label={`Manfaat paket ${tier.name}`}>
                  {tier.benefits.map((benefit) => (
                    <li
                      key={benefit}
                      className="flex items-start gap-2 text-sm text-gray-700"
                    >
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-teal-500"
                        aria-hidden
                      />
                      {benefit}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href="/signup"
                  className={cn(btnBase, btnVariants.primary)}
                >
                  Mulai Sekarang
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Orange CTA band (OBS-005)                                        */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-gradient-to-r from-orange-700 to-orange-800 px-4 py-20 text-white">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-white">
            Siap meningkatkan produktivitas Anda?
          </h2>
          <p className="mb-8 text-base text-white">
            Daftar sekarang dan mulai bekerja di ruang terbaik!
          </p>
          <Link
            href="/signup"
            className={cn(btnBase, btnVariants.ctaWhite)}
          >
            Buat Akun Gratis
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
