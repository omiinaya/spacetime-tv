import { useNavigate } from "react-router";
import { Tv, Home, RotateCcw } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
        <Tv className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <h1 className="text-3xl font-bold mb-2">404</h1>
      <p className="text-muted-foreground mb-1">Page not found</p>
      <p className="text-sm text-muted-foreground/60 max-w-sm">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex gap-3 mt-8">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Home className="h-4 w-4" />
          Go Home
        </button>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Go Back
        </button>
      </div>
    </div>
  );
}
