import { BarChart3 } from "lucide-react";

interface PopularContentTableProps {
  popular: { stream: string; hits: number }[];
}

export default function PopularContentTable({
  popular,
}: PopularContentTableProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Popular Content</h2>
      </div>
      {popular.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stream data yet.</p>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-2">Stream</th>
                <th className="px-4 py-2 text-right">Hits</th>
              </tr>
            </thead>
            <tbody>
              {popular.map((s, i) => (
                <tr key={s.stream} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                  <td className="px-4 py-2 font-mono text-xs">{s.stream}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {s.hits.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
