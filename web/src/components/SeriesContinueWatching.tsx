import ContinueWatchingRow from "@/components/ContinueWatchingRow";
import RecentlyCompletedRow from "@/components/RecentlyCompletedRow";

interface SeriesContinueWatchingProps {
  navigate: (path: string) => void;
}

export default function SeriesContinueWatching({
  navigate,
}: SeriesContinueWatchingProps) {
  return (
    <>
      <ContinueWatchingRow navigate={navigate} />
      <RecentlyCompletedRow navigate={navigate} />
    </>
  );
}
