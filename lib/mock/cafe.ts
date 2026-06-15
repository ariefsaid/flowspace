import type { LastOrder, MenuItem } from "./types";

/**
 * Cafe menu (OBS-072/073). Drinks carry variants (hot/cold + sugar level);
 * fixed items add directly.
 */
export const menuItems: MenuItem[] = [
  // Coffee
  {
    id: "americano",
    name: "Americano",
    emoji: "☕",
    category: "Coffee",
    price: 25000,
    description: "Espresso dengan air panas, pahit yang bersih.",
    hasVariants: true,
  },
  {
    id: "latte",
    name: "Latte",
    emoji: "🥛",
    category: "Coffee",
    price: 32000,
    description: "Espresso lembut dengan susu steamed.",
    hasVariants: true,
  },
  {
    id: "cappuccino",
    name: "Cappuccino",
    emoji: "☕",
    category: "Coffee",
    price: 30000,
    description: "Espresso dengan foam susu tebal.",
    hasVariants: true,
  },
  {
    id: "espresso",
    name: "Espresso",
    emoji: "☕",
    category: "Coffee",
    price: 20000,
    description: "Shot espresso pekat, sajian klasik.",
    hasVariants: true,
  },
  // Non-Coffee
  {
    id: "matcha",
    name: "Matcha Latte",
    emoji: "🍵",
    category: "Non-Coffee",
    price: 35000,
    description: "Matcha premium dengan susu segar.",
    hasVariants: true,
  },
  {
    id: "chocolate",
    name: "Chocolate",
    emoji: "🍫",
    category: "Non-Coffee",
    price: 28000,
    description: "Cokelat kental hangat atau dingin.",
    hasVariants: true,
  },
  {
    id: "orange-juice",
    name: "Orange Juice",
    emoji: "🍊",
    category: "Non-Coffee",
    price: 22000,
    description: "Jus jeruk peras segar tanpa gula tambahan.",
    hasVariants: true,
  },
  {
    id: "lemon-tea",
    name: "Lemon Tea",
    emoji: "🍋",
    category: "Non-Coffee",
    price: 20000,
    description: "Teh dengan perasan lemon segar.",
    hasVariants: true,
  },
  // Food
  {
    id: "tempe-orek",
    name: "Tempe Orek",
    emoji: "🍱",
    category: "Food",
    price: 4500,
    description: "Tempe manis pedas, lauk pendamping.",
    hasVariants: false,
  },
  {
    id: "croissant",
    name: "Croissant",
    emoji: "🥐",
    category: "Food",
    price: 25000,
    description: "Croissant butter renyah, baru dipanggang.",
    hasVariants: false,
  },
  {
    id: "sandwich",
    name: "Sandwich",
    emoji: "🥪",
    category: "Food",
    price: 35000,
    description: "Roti isi ayam, telur, dan sayuran.",
    hasVariants: false,
  },
  {
    id: "salad",
    name: "Salad",
    emoji: "🥗",
    category: "Food",
    price: 45000,
    description: "Salad sayur segar dengan dressing.",
    hasVariants: false,
  },
  {
    id: "nasi-rames",
    name: "Nasi Rames",
    emoji: "🍛",
    category: "Food",
    price: 40000,
    description: "Nasi dengan aneka lauk lengkap.",
    hasVariants: false,
  },
  {
    id: "mie-goreng",
    name: "Mie Goreng",
    emoji: "🍜",
    category: "Food",
    price: 38000,
    description: "Mie goreng bumbu spesial dengan telur.",
    hasVariants: false,
  },
  // Snack
  {
    id: "tahu-goreng",
    name: "Tahu Goreng",
    emoji: "🧆",
    category: "Snack",
    price: 25000,
    description: "Tahu goreng renyah dengan sambal.",
    hasVariants: false,
  },
  {
    id: "chicken-wings",
    name: "Chicken Wings",
    emoji: "🍗",
    category: "Snack",
    price: 35000,
    description: "Sayap ayam goreng bumbu pedas manis.",
    hasVariants: false,
  },
];

/** "Pesanan Terakhir" panel (OBS-073). */
export const lastOrder: LastOrder = {
  id: "ord_1029",
  status: "Selesai",
  date: "2026-06-14T10:24:00+07:00",
  lines: [
    { name: "Latte", qty: 1, variant: "Cold, Less Sugar" },
    { name: "Croissant", qty: 2 },
  ],
  total: 82000,
};
