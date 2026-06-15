import Link from "next/link";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";

/** Sticky glass nav for public surfaces: brand + Masuk / Daftar (OBS-001). */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 h-[65px] border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto flex h-full items-center justify-between px-4">
        <Link href="/" aria-label="Beranda">
          <BrandMark />
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Masuk
            </Button>
          </Link>
          <Link href="/signup">
            <Button variant="primary" size="sm">
              Daftar
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export default PublicHeader;
