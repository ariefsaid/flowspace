"use client";

// Re-export next-auth/react's SessionProvider so it can be used in the root
// server layout without "use client" leaking into that file.
export { SessionProvider } from "next-auth/react";
