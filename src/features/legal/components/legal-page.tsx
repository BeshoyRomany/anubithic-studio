import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

// Shared shell for /privacy and /terms: same look as the /security page
export const LegalPage = ({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) => (
  <main className="min-h-screen bg-background px-4 py-12">
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <header className="flex flex-col gap-4">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/">
            <ArrowLeftIcon className="size-4" />
            Back to Anubithic Studio
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{intro}</p>
        <p className="text-xs text-muted-foreground">Last updated {updated}.</p>
      </header>
      {children}
      <footer className="flex flex-wrap gap-4 border-t border-foreground/10 pt-4 text-xs text-muted-foreground">
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Privacy Policy
        </Link>
        <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
          Terms of Service
        </Link>
        <Link href="/security" className="underline underline-offset-4 hover:text-foreground">
          How we protect your API keys
        </Link>
      </footer>
    </div>
  </main>
);

export const LegalSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <h2 className="text-lg font-semibold">{title}</h2>
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
      {children}
    </div>
  </section>
);

export const LegalList = ({ children }: { children: React.ReactNode }) => (
  <ul className="flex list-disc flex-col gap-1.5 pl-5">{children}</ul>
);

export const Em = ({ children }: { children: React.ReactNode }) => (
  <span className="text-foreground">{children}</span>
);
