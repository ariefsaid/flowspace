import type { CreditPackage } from "./types";

/** Time-credit packages with volume discount per hour (OBS-101). */
export const creditPackages: CreditPackage[] = [
  { id: "pkg-5h", hours: 5, price: 75000, pricePerHour: 15000 },
  { id: "pkg-10h", hours: 10, price: 140000, pricePerHour: 14000 },
  {
    id: "pkg-20h",
    hours: 20,
    price: 260000,
    pricePerHour: 13000,
    popular: true,
  },
  { id: "pkg-50h", hours: 50, price: 600000, pricePerHour: 12000 },
];
