// src/components/layout/WorkspaceShell.tsx
// The outer layout wrapper for every workspace in the app.
// Renders a full-height layout with a left sidebar and a main content area.
// Server component — no data fetching, only provides structure.

interface WorkspaceShellProps {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
}

export function WorkspaceShell({ sidebar, header, children }: WorkspaceShellProps) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar — hidden on mobile, visible on desktop. Sticky so it stays
          in view while the main content scrolls. Height capped to viewport. */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 sticky top-0 h-screen overflow-hidden">
        {sidebar}
      </aside>

      {/* Main area — header + content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          {header}
        </header>
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
