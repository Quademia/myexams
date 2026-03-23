// Simple test page — no database, no auth, just renders HTML.
// If this works but /login doesn't, the problem is in our imports.

export default function TestPage() {
  return (
    <main className="max-w-md mx-auto p-6 mt-12">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h1 className="text-xl font-bold">Test Page</h1>
        <p className="text-gray-600 mt-2">If you can see this, Next.js is working.</p>
      </div>
    </main>
  );
}
