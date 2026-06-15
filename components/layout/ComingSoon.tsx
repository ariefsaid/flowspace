import { Card } from "@/components/ui/Card";

export interface ComingSoonProps {
  /** Surface name, e.g. "Pengguna" -> "Halaman Pengguna segera hadir". */
  title: string;
}

/** Placeholder body for routes not yet built, so nav never 404s. */
export function ComingSoon({ title }: ComingSoonProps) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card variant="muted" className="p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">
          Halaman {title} segera hadir.
        </p>
      </Card>
    </div>
  );
}

export default ComingSoon;
