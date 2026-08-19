import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { getItemPadding } from "./constants";

interface LoadingRowProps {
  className?: string;
  level?: number;
}

export const LoadingRow = ({ className, level = 0 }: LoadingRowProps) => {
  return (
    <div
      className={cn("h-5.5 flex items-center text-muted-foreground", className)}
      //LoadingRow should take 16 offset by default as isFile exactly.
      style={{ paddingLeft: getItemPadding(level, true) }}
    >
      <Spinner className="size-4 text-ring ml-0.5" />
    </div>
  );
};
