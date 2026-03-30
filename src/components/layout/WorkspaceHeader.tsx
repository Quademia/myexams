// src/components/layout/WorkspaceHeader.tsx
// A simple reusable header bar for use inside WorkspaceShell.
// Server component — intentionally minimal. Each workspace customises
// its header by passing different content to WorkspaceShell's header prop.

interface WorkspaceHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function WorkspaceHeader({ title, subtitle, actions }: WorkspaceHeaderProps) {
  return (
    <>
      <div>
        <h1 className="font-semibold text-lg">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div>{actions}</div>}
    </>
  );
}
