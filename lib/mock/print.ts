import type { PrintJob, WifiInfo } from "./types";

/** WiFi access card (OBS-054). */
export const wifiInfo: WifiInfo = {
  ssid: "PasificOcean",
  voucher: "6070202085",
};

/** Recent print jobs (OBS-083): status Menunggu (WAITING) / Siap Ambil (READY). */
export const printJobs: PrintJob[] = [
  {
    id: "pj_410",
    filename: "kontrak-sewa.pdf",
    pages: 12,
    price: 11520,
    status: "WAITING",
    datetime: "2026-06-15T15:01:00+07:00",
  },
  {
    id: "pj_405",
    filename: "gugatan-perdata.docx",
    pages: 8,
    price: 4000,
    status: "READY",
    datetime: "2026-06-14T11:30:00+07:00",
  },
  {
    id: "pj_398",
    filename: "presentasi-klien.pdf",
    pages: 24,
    price: 22800,
    status: "READY",
    datetime: "2026-06-12T09:15:00+07:00",
  },
];
