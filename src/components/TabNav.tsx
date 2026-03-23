// src/components/TabNav.tsx
// Reusable tab navigation — the same tab bar pattern used on courses, classes,
// people, and sittings pages. Built ONCE, used everywhere.
//
// HOW IT WORKS:
// Takes an array of tab objects (label + href) and highlights the active one.
// Each tab is just a link (<a> tag) that navigates to a URL with a ?tab= param.
// The server re-renders the page with the right tab content. No JavaScript needed
// for basic tab switching — it's just URL navigation.
//
// USAGE:
//   <TabNav
//     tabs={[
//       { label: "Details", href: "/school/courses/123?tab=details" },
//       { label: "Teachers", href: "/school/courses/123?tab=teachers" },
//       { label: "Students", href: "/school/courses/123?tab=students" },
//     ]}
//     activeTab="teachers"
//   />

interface Tab {
  label: string;
  href: string;
  value: string;   // The tab identifier (matches the ?tab= query param)
}

interface TabNavProps {
  tabs: Tab[];
  activeTab: string;
}

export function TabNav({ tabs, activeTab }: TabNavProps) {
  return (
    <div className="flex gap-1 border-b border-gray-200 mb-4">
      {/* .map() loops over the tabs array and renders one link per tab.
          This is how React renders lists — similar to a for loop in HTML. */}
      {tabs.map((tab) => (
        <a
          key={tab.value}
          href={tab.href}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === tab.value
              ? "bg-white text-teal-700 border border-b-0 border-gray-200 -mb-px"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}
        >
          {tab.label}
        </a>
      ))}
    </div>
  );
}
