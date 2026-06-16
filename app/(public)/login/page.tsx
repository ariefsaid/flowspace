'use client';

import { useState } from "react";
import Link from "next/link";
import { Mail, Lock } from "lucide-react";
import { signIn, getSession } from "next-auth/react";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { roleHome } from "@/lib/auth/route-policy";
import type { Role } from "@prisma/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      // signIn with redirect:false so we can handle routing client-side.
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        // AC-003: same generic message for unknown email AND wrong password — no enumeration.
        setError("Email atau kata sandi salah.");
        return;
      }

      // Read the freshly-minted session to determine the user's role,
      // then navigate to their role-home (FR-003 / AC-002).
      const session = await getSession();
      window.location.href = roleHome((session?.user?.role ?? "MEMBER") as Role);
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
              <h1 className="text-2xl font-bold text-gray-900">Selamat Datang</h1>
              <p className="mt-1 text-sm text-gray-500">
                Masuk untuk mengakses ruang kerja Anda
              </p>
            </div>
          </div>

          {/* Generic auth error (AC-003) */}
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
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

            {/* Kata Sandi */}
            <div className="space-y-1.5">
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
                  placeholder="Masukkan kata sandi"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  required
                  autoComplete="current-password"
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
              {pending ? "Memproses…" : "Masuk"}
            </Button>
          </form>

          {/* Footer link */}
          <p className="mt-6 text-center text-sm text-gray-500">
            Belum punya akun?{" "}
            <Link
              href="/signup"
              className="font-medium text-teal-600 hover:text-teal-700 hover:underline"
            >
              Daftar
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
