import Link from "next/link";
import {
  Clock,
  Users,
  Monitor,
  Printer,
  QrCode,
  Coffee,
  ArrowRight,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { brand } from "@/brand.config";

// ---------------------------------------------------------------------------
// Shared link-button class builders (Button primitive is <button>-only)
// ---------------------------------------------------------------------------

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 text-sm";

const btnVariants = {
  primary: "bg-teal-500 text-white hover:bg-teal-600 shadow-sm h-10 px-4",
  accent:
    "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md hover:from-orange-600 hover:to-orange-600 h-12 px-6 text-base",
  outline:
    "border-2 border-teal-600 text-teal-600 bg-white hover:bg-teal-50 h-12 px-6 text-base",
  outlineHeroWhite:
    "border-2 border-white text-white bg-transparent hover:bg-white/10 h-12 px-6 text-base",
  outlineOrangeCta:
    "border-2 border-white bg-white text-orange-600 shadow-md hover:bg-orange-50 hover:text-orange-700 h-12 px-6 text-base font-semibold",
  tierPrimary: "bg-teal-500 text-white hover:bg-teal-600 shadow-sm h-10 px-4 w-full",
  tierOutline:
    "border-2 border-teal-600 text-teal-600 bg-white hover:bg-teal-50 h-10 px-4 w-full",
};

// ---------------------------------------------------------------------------
// Feature cards data
// ---------------------------------------------------------------------------

const features = [
  {
    icon: Clock,
    iconBg: "bg-teal-100",
    iconColor: "text-teal-600",
    title: "Kredit Waktu",
    desc: "Beli paket jam dan gunakan secara fleksibel di semua fasilitas.",
  },
  {
    icon: Users,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    title: "Ruang Meeting",
    desc: "2 ruang meeting lengkap untuk 8–10 orang per ruangan.",
  },
  {
    icon: Monitor,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "Ruang Coworking",
    desc: "10 kursi coworking dengan koneksi internet berkecepatan tinggi.",
  },
  {
    icon: Printer,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    title: "Layanan Print",
    desc: "Cetak dokumen langsung dari browser. Harga per halaman, diskon member.",
  },
  {
    icon: QrCode,
    iconBg: "bg-teal-100",
    iconColor: "text-teal-600",
    title: "Akses Digital",
    desc: "Kartu akses QR untuk fasilitas dan printer tanpa perlu ID fisik.",
  },
  {
    icon: Coffee,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    title: "Diskon Cafe",
    desc: "Nikmati kopi dan makanan dengan diskon eksklusif untuk member.",
  },
];

// ---------------------------------------------------------------------------
// Membership tiers data
// ---------------------------------------------------------------------------

interface MembershipTier {
  name: string;
  price: string;
  period: string;
  popular: boolean;
  benefits: string[];
  cta: string;
}

const membershipTiers: MembershipTier[] = [
  {
    name: "Starter",
    price: "Rp 150.000",
    period: "/ bulan",
    popular: false,
    benefits: [
      "5 jam kredit waktu",
      "Akses coworking reguler",
      "Diskon cafe 5%",
      "Akses WiFi premium",
      "QR akses digital",
    ],
    cta: "Pilih Starter",
  },
  {
    name: "Professional",
    price: "Rp 350.000",
    period: "/ bulan",
    popular: true,
    benefits: [
      "20 jam kredit waktu",
      "Prioritas booking meeting room",
      "Diskon cafe 10%",
      "Diskon print 10%",
      "Akses WiFi premium",
      "QR akses digital",
      "Saldo print 20 lembar",
    ],
    cta: "Pilih Professional",
  },
  {
    name: "Enterprise",
    price: "Rp 750.000",
    period: "/ bulan",
    popular: false,
    benefits: [
      "50 jam kredit waktu",
      "Booking meeting room prioritas tinggi",
      "Diskon cafe 20%",
      "Diskon print 20%",
      "Akses WiFi premium",
      "QR akses digital",
      "Saldo print 50 lembar",
      "Dedicated support",
    ],
    cta: "Pilih Enterprise",
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
            Kerja, Meeting &amp;{" "}
            <span className="text-orange-400">Ngopi</span>
          </h1>

          {/* Subheading */}
          <p className="mx-auto mb-8 max-w-xl text-base text-white/85 sm:text-lg">
            Pengalaman coworking terintegrasi dengan cafe, ruang meeting, dan
            sistem kredit waktu yang fleksibel.
          </p>

          {/* Primary CTAs */}
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className={cn(btnBase, btnVariants.accent)}
            >
              Mulai Sekarang
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/login"
              className={cn(btnBase, btnVariants.outlineHeroWhite)}
            >
              Masuk Member
            </Link>
          </div>

          {/* Guest CTA */}
          <p className="mt-6 text-sm text-white/75">
            Hanya ingin memesan makanan &amp; minuman?{" "}
            <Link
              href="/cafe/guest"
              className="font-medium text-orange-300 underline underline-offset-2 hover:text-orange-200"
            >
              Order Cafe sebagai Guest
            </Link>
          </p>
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
              Dari ruang kerja fleksibel hingga koneksi internet, semua
              tersedia untuk Anda.
            </p>
          </div>

          {/* Feature grid */}
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
                    <Icon
                      className={cn("h-5 w-5", f.iconColor)}
                      aria-hidden
                    />
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
      {/* 3. Membership tiers                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-slate-50 px-4 py-20">
        <div className="container mx-auto max-w-5xl">
          {/* Section header */}
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold text-gray-900">
              Paket Membership
            </h2>
            <p className="text-base text-gray-500">
              Pilih paket yang sesuai dengan kebutuhan kerja Anda.
            </p>
          </div>

          {/* Tier cards */}
          <div className="grid gap-6 sm:grid-cols-3">
            {membershipTiers.map((tier) => (
              <div key={tier.name} className="relative flex flex-col">
                {/* Popular badge overlay */}
                {tier.popular && (
                  <div className="absolute -top-3.5 left-0 right-0 flex justify-center">
                    <Badge tone="active" className="shadow-sm">
                      Paling Populer
                    </Badge>
                  </div>
                )}

                <Card
                  variant={tier.popular ? "highlight" : "default"}
                  className={cn(
                    "flex flex-1 flex-col p-6",
                    tier.popular && "pt-8",
                  )}
                >
                  {/* Tier name */}
                  <h3 className="mb-1 text-lg font-semibold text-gray-800">
                    {tier.name}
                  </h3>

                  {/* Price */}
                  <div className="mb-6 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-gray-900">
                      {tier.price}
                    </span>
                    <span className="text-sm text-gray-500">{tier.period}</span>
                  </div>

                  {/* Benefits */}
                  <ul className="mb-8 flex-1 space-y-2.5">
                    {tier.benefits.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2 text-sm text-gray-700"
                      >
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-teal-500"
                          aria-hidden
                        />
                        {b}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Link
                    href="/signup"
                    className={cn(
                      btnBase,
                      tier.popular
                        ? btnVariants.tierPrimary
                        : btnVariants.tierOutline,
                    )}
                  >
                    {tier.cta}
                  </Link>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Orange CTA band                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-16">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="mb-3 text-2xl font-bold text-white sm:text-3xl">
            Siap meningkatkan produktivitas Anda?
          </h2>
          <p className="mb-8 text-base text-white/85">
            Bergabung dengan {brand.name} dan mulai bekerja lebih produktif
            hari ini.
          </p>
          <Link
            href="/signup"
            className={cn(btnBase, btnVariants.outlineOrangeCta)}
          >
            Buat Akun Gratis
          </Link>
        </div>
      </section>
    </>
  );
}
