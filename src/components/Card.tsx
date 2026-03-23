// src/components/Card.tsx
// A simple card wrapper — the white rounded box that contains content sections.
// In the old code, this was the .card CSS class applied manually everywhere.
// Now it's a reusable component.
//
// USAGE:
//   <Card>
//     <h2>Course Details</h2>
//     <p>Medical Nursing</p>
//   </Card>
//
//   <Card title="Enrolled Students">
//     <DataTable ... />
//   </Card>

interface CardProps {
  title?: string;
  children: React.ReactNode;  // Whatever you put between <Card> and </Card>
}

export function Card({ title, children }: CardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
      {title && (
        <h2 className="text-base font-semibold mb-3">{title}</h2>
      )}
      {children}
    </div>
  );
}
