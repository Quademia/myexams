"use client";

// src/components/ui/ProfileDrawer.tsx
// Renders the user's own profile inside a DrawerShell.
// Replaces the standalone /profile page for users inside a workspace.

import { useEffect, useState } from "react";
import { DrawerShell } from "@/components/ui/DrawerShell";

interface ProfileUser {
  id: string;
  name: string;
  email: string;
  is_system_admin: number;
}

interface ProfileMembership {
  tenant_id: string;
  tenant_name: string;
  role: string;
  status: string;
}

interface ProfileDrawerProps {
  open: boolean;
  onClose: () => void;
  user: ProfileUser;
  memberships: ProfileMembership[];
  changePasswordAction: (formData: FormData) => Promise<void>;
}

function roleBadgeLabel(role: string): string {
  switch (role) {
    case "SCHOOL_ADMIN": return "School Admin";
    case "TEACHER": return "Teacher";
    case "STUDENT": return "Student";
    default: return role;
  }
}

export function ProfileDrawer({
  open,
  onClose,
  user,
  memberships,
  changePasswordAction,
}: ProfileDrawerProps) {
  const [successBanner, setSuccessBanner] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") setSuccessBanner(true);
    const err = params.get("error");
    if (err) setErrorBanner(decodeURIComponent(err));
  }, []);

  return (
    <DrawerShell open={open} onClose={onClose} title="My Profile" width="md">
      {/* Success banner */}
      {successBanner && (
        <div className="bg-green-50 text-green-700 text-sm px-3 py-2 rounded-lg mb-4">
          Password updated successfully
        </div>
      )}

      {/* Error banner */}
      {errorBanner && (
        <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">
          {errorBanner}
        </div>
      )}

      {/* Section 1 — Identity */}
      <div>
        <div className="font-semibold text-base">{user.name}</div>
        <div className="text-sm text-gray-500">{user.email}</div>
        {user.is_system_admin === 1 && (
          <span className="inline-block mt-2 bg-purple-50 text-purple-700 text-xs rounded-full px-2 py-0.5 font-medium">
            System Administrator
          </span>
        )}
      </div>

      <hr className="border-gray-100 my-5" />

      {/* Section 2 — My Schools */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">My schools</h3>
        {memberships.length === 0 ? (
          <p className="text-sm text-gray-400">No school memberships</p>
        ) : (
          <div className="flex flex-col gap-2">
            {memberships.map((m) => (
              <div key={m.tenant_id} className="flex items-center gap-2">
                <span className="font-medium text-sm">{m.tenant_name}</span>
                <span className="bg-teal-50 text-teal-700 text-xs rounded-full px-2 py-0.5 font-medium">
                  {roleBadgeLabel(m.role)}
                </span>
                {m.status !== "ACTIVE" && (
                  <span className="text-xs text-gray-400">{m.status}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <hr className="border-gray-100 my-5" />

      {/* Section 3 — Change Password */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Change password</h3>
        <form action={changePasswordAction}>
          <label className="block text-sm text-gray-600 mb-1">Current password</label>
          <input
            type="password"
            name="current_password"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
          />

          <label className="block text-sm text-gray-600 mb-1">New password</label>
          <input
            type="password"
            name="new_password"
            required
            placeholder="6+ characters"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
          />

          <label className="block text-sm text-gray-600 mb-1">Confirm new password</label>
          <input
            type="password"
            name="confirm_password"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
          />

          <button
            type="submit"
            className="w-full mt-1 px-4 py-2 bg-teal-700 text-white text-sm rounded-lg hover:bg-teal-800"
          >
            Update password
          </button>
        </form>
      </div>
    </DrawerShell>
  );
}
