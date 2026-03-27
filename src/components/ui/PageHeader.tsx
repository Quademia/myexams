// src/components/PageHeader.tsx
// A reusable page header component — displays the page title, optional subtitle,
// and an optional back link. Used at the top of every page.
//
// HOW IT WORKS:
// This is a React component. It takes "props" (properties) as input and returns
// JSX (HTML-like syntax that React understands).
//
// USAGE:
//   <PageHeader title="Medical Nursing" subtitle="Course Details" backHref="/school/courses" />
//   <PageHeader title="People" />  ← no subtitle or back link

interface PageHeaderProps {
  title: string;
  subtitle?: string;        // Optional — the ? means it can be omitted
  backHref?: string;         // Optional — URL for the back link
  backLabel?: string;        // Optional — text for the back link (default: "Back")
}

export function PageHeader({ title, subtitle, backHref, backLabel = "Back" }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {/* Only show back link if backHref is provided */}
      {backHref && (
        <a href={backHref} className="text-sm text-teal-700 hover:underline">
          ← {backLabel}
        </a>
      )}
      <h1 className="text-xl font-bold text-gray-900 mt-1">{title}</h1>
      {subtitle && (
        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
