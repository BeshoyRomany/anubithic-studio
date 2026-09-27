import { cn } from "@/lib/utils";

interface LogoLoaderProps {
  label?: string;
  className?: string;
}

//Full-screen loading state: the Anubis mark fading in and out in logo gold
export const LogoLoader = ({ label, className }: LogoLoaderProps) => {
  return (
    <div
      role="status"
      aria-label={label ?? "Loading"}
      className={cn(
        "flex h-screen w-full flex-col items-center justify-center gap-4 bg-background",
        className,
      )}
    >
      <div className="relative size-16">
        {/* Soft glow that breathes with the mark */}
        <div className="absolute -inset-4 animate-logo-breathe motion-reduce:animate-none rounded-full bg-logo/20 blur-xl" />
        {/* The SVG has a baked-in fill, so it's used as a mask over bg-logo */}
        <div className="relative size-full animate-logo-breathe motion-reduce:animate-none bg-logo [mask:url(/logo-alt.svg)_center/contain_no-repeat]" />
      </div>
      {label && (
        <span className="animate-pulse text-sm text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
};
