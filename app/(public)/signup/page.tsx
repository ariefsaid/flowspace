'use client';

import { useState } from "react";
import Link from "next/link";
import { User, Mail, Phone, Lock, CheckCircle2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { brand } from "@/brand.config";
import { signupAction } from "./actions";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // `phone` is collected for UI parity with the original but intentionally NOT
  // persisted: there is no phone column in the current AppUser schema scope.
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side confirmation check (FR-004)
    if (password !== confirmPassword) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setPending(true);
    try {
      const res = await signupAction({ name, email, password });

      if ("error" in res) {
        setError(res.error); // AC-005: duplicate email, short password, etc.
        return;
      }

      // AC-004: user created → sign in immediately → middleware routes to /dashboard
      await signIn("credentials", {
        email,
        password,
        callbackUrl: "/dashboard",
        redirect: true, // allow NextAuth to handle the redirect
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-65px-120px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md mx-auto">
        <Card className="p-6 sm:p-8">
          {/* Brand */}
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <BrandMark showName={false} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Buat Akun</h1>
              <p className="mt-1 text-sm text-gray-500">
                Bergabung dengan {brand.name}
              </p>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Nama Lengkap */}
            <div className="space-y-1">
              <label htmlFor="name" className="block text-sm font-medium text-slate-950">
                Nama Lengkap
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <User className="h-4 w-4" aria-hidden="true" />
                </span>
                <Input
                  id="name"
                  type="text"
                  placeholder="Nama lengkap Anda"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9"
                  required
                  autoComplete="name"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label htmlFor="email" className="block text-sm font-medium text-slate-950">
                Email
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                </span>
                <Input
                  id="email"
                  type="email"
                  placeholder="anda@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Telepon (opsional) */}
            <div className="space-y-1">
              <label htmlFor="phone" className="block text-sm font-medium text-slate-950">
                Telepon <span className="font-normal text-gray-500">(opsional)</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                </span>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+62 812 3456 7890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-9"
                  autoComplete="tel"
                />
              </div>
            </div>

            {/* Kata Sandi */}
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-slate-950">
                Kata Sandi
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <Lock className="h-4 w-4" aria-hidden="true" />
                </span>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimal 6 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  required
                  autoComplete="new-password"
                  minLength={6}
                />
              </div>
            </div>

            {/* Konfirmasi Kata Sandi */}
            <div className="space-y-1">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-950">
                Konfirmasi Kata Sandi
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Ulangi kata sandi"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-9"
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="mt-2 w-full"
              disabled={pending}
            >
              {pending ? "Memproses…" : "Buat Akun"}
            </Button>
          </form>

          {/* Footer link */}
          <p className="mt-6 text-center text-sm text-gray-500">
            Sudah punya akun?{" "}
            <Link
              href="/login"
              className="font-medium text-teal-600 hover:text-teal-700 hover:underline"
            >
              Masuk
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
