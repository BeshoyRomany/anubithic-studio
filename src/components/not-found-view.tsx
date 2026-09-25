import Link from "next/link";
import { HomeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotFoundViewProps {
  title?: string;
  description?: string;
}

// Shared "404" screen with a way back to the home page
export const NotFoundView = ({
  title = "Page not found",
  description = "The page you're looking for doesn't exist or was moved.",
}: NotFoundViewProps) => {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <img
        src={"/logo.svg"}
        alt="Anubithic"
        className="size-12 drop-shadow-[0_0_18px_rgba(212,170,90,0.35)]"
      />
      <div className="flex flex-col items-center gap-2">
        <span className="font-mono text-5xl font-semibold text-logo">404</span>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      <Button asChild variant="outline">
        <Link href="/">
          <HomeIcon className="size-4" />
          Back to home
        </Link>
      </Button>
    </main>
  );
};
