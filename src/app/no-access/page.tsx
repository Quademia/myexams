// src/app/no-access/page.tsx
// Shown when a user has no active school memberships.

import { Card } from "@/components/Card";

export default function NoAccessPage() {
  return (
    <main className="max-w-md mx-auto p-6 mt-12">
      <Card>
        <h1 className="text-xl font-bold">No access</h1>
        <p className="text-sm text-gray-500 mt-2">
          Your account has no active school access yet.
        </p>
        <p className="text-sm text-gray-500 mt-1">
          If you have a join code, go to <a href="/join" className="text-teal-700 hover:underline">/join</a>.
        </p>
        <a href="/logout" className="inline-block mt-4 text-sm text-teal-700 hover:underline">
          Logout
        </a>
      </Card>
    </main>
  );
}
