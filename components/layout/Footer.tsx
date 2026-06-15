import { BrandMark } from "@/components/ui/BrandMark";
import { brand } from "@/brand.config";

/** Dark public footer: brand + copyright + tagline (OBS-005). */
export function Footer() {
  return (
    <footer className="bg-slate-900 text-white">
      <div className="container mx-auto flex flex-col items-center gap-3 px-4 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
        <BrandMark variant="light" />
        <p className="text-sm text-slate-400">
          © 2026 {brand.name}. Ruang kerja untuk profesional modern.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
