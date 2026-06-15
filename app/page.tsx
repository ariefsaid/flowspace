import { brand } from "@/brand.config";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">{brand.name}</h1>
      <p className="max-w-md text-lg text-neutral-500">
        {brand.name} — coworking + cafe platform. Scaffold ready.
      </p>
    </main>
  );
}
