"use client";

import { useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { Input, Select, Button } from "@/components/ui";
import { ROLES, MEMBERSHIP_TIERS, type Role, type MembershipTier } from "@/lib/db/enums";
import type { AdminUserView } from "./UsersClient";
import { parseUserFieldError, isPasswordError, userErrorMessage } from "./userErrors";

export const ROLE_LABELS: Record<Role, string> = {
  MEMBER: "Member",
  ADMIN: "Admin",
  BARISTA: "Barista",
};

export const TIER_LABELS: Record<MembershipTier, string> = {
  REGULAR: "Regular",
  PREMIUM: "Premium",
  GOLD: "Gold",
};

export interface UserFormValues {
  name: string;
  role: Role;
  membershipTier: MembershipTier;
  /** Empty string = "leave unchanged" (mirrors ORIG's edit-dialog password field). */
  password: string;
}

export function UserFormDialog({
  user,
  onCancel,
  onSave,
}: {
  user: AdminUserView;
  onCancel: () => void;
  onSave: (values: UserFormValues) => Promise<void>;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [membershipTier, setMembershipTier] = useState<MembershipTier>(user.tier);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setStatus("saving");
    setFieldError(null);
    setPasswordError(null);
    setFormError(null);
    try {
      await onSave({ name, role, membershipTier, password });
    } catch (e) {
      setStatus("error");
      const fe = parseUserFieldError(e);
      if (fe) {
        setFieldError(fe);
        return;
      }
      if (isPasswordError(e)) {
        setPasswordError(userErrorMessage(e));
        return;
      }
      setFormError(userErrorMessage(e));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-form-title"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 id="user-form-title" className="text-lg font-semibold text-gray-900">
            Edit User
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-gray-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block" htmlFor="user-name">
            <span className="text-sm font-medium text-gray-700">Nama</span>
            <Input
              id="user-name"
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={fieldError?.field === "name"}
              aria-describedby={fieldError?.field === "name" ? "user-name-error" : undefined}
            />
            {fieldError?.field === "name" && (
              <p id="user-name-error" role="alert" className="mt-1 text-xs text-red-600">
                {fieldError.message}
              </p>
            )}
          </label>

          <label className="block" htmlFor="user-role">
            <span className="text-sm font-medium text-gray-700">Role</span>
            <Select
              id="user-role"
              className="mt-1"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              aria-invalid={fieldError?.field === "role"}
              aria-describedby={fieldError?.field === "role" ? "user-role-error" : undefined}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
            {fieldError?.field === "role" && (
              <p id="user-role-error" role="alert" className="mt-1 text-xs text-red-600">
                {fieldError.message}
              </p>
            )}
          </label>

          <label className="block" htmlFor="user-tier">
            <span className="text-sm font-medium text-gray-700">Membership</span>
            <Select
              id="user-tier"
              className="mt-1"
              value={membershipTier}
              onChange={(e) => setMembershipTier(e.target.value as MembershipTier)}
              aria-invalid={fieldError?.field === "membershipTier"}
              aria-describedby={fieldError?.field === "membershipTier" ? "user-tier-error" : undefined}
            >
              {MEMBERSHIP_TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}
                </option>
              ))}
            </Select>
            {fieldError?.field === "membershipTier" && (
              <p id="user-tier-error" role="alert" className="mt-1 text-xs text-red-600">
                {fieldError.message}
              </p>
            )}
          </label>

          <label className="block" htmlFor="user-password">
            <span className="text-sm font-medium text-gray-700">
              Password Baru (kosongkan jika tidak diubah)
            </span>
            <div className="relative mt-1">
              <Input
                id="user-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 karakter"
                autoComplete="new-password"
                aria-invalid={passwordError !== null}
                aria-describedby={passwordError !== null ? "user-password-error" : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            {passwordError !== null && (
              <p id="user-password-error" role="alert" className="mt-1 text-xs text-red-600">
                {passwordError}
              </p>
            )}
          </label>
        </div>

        {formError && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {formError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={status === "saving"}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={status === "saving"}>
            {status === "saving" ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
