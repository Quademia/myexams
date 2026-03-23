// This is the homepage — it renders when someone visits the root URL "/".
// For now it's just a placeholder to verify the app is working.
// We'll replace this with the real login/dashboard page later.

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-teal-700">QAcademy</h1>
      <p className="mt-2 text-gray-600">
        Next.js is running. Stack migration in progress.
      </p>
    </main>
  );
}
