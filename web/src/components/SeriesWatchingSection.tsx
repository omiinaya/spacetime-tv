import { useNavigate } from "react-router";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";
import RecentlyCompletedRow from "@/components/RecentlyCompletedRow";

interface Props {
  navigate: ReturnType<typeof useNavigate>;
}

export default function SeriesWatchingSection({ navigate }: Props) {
  return (
    <>
      <ContinueWatchingRow navigate={navigate} />
      <RecentlyCompletedRow navigate={navigate} />
    </>
  );
}
