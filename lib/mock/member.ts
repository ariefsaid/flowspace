import type { Member } from "./types";

/**
 * The signed-in member used across member surfaces (OBS-050/051/056).
 * ACTIVE walk-in session at "Meja F", Rp 15.000/jam, max 4h.
 */
export const currentMember: Member = {
  id: "usr_budi",
  name: "Budi Santoso",
  email: "budi.santoso@example.id",
  tier: "PREMIUM",
  tierLabel: "Tarif standar",
  timeCredits: 139,
  printBalance: 68,
  activeSession: {
    table: "Meja F",
    tarifPerHour: 15000,
    maxHours: 4,
    // ~13 minutes into the session relative to the recon snapshot.
    startedAt: "2026-06-15T16:43:00+07:00",
  },
};
