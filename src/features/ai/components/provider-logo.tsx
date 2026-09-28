import { LaptopIcon } from "lucide-react";

import { ModelSelectorLogo } from "@/components/ai-elements/model-selector";
import { cn } from "@/lib/utils";

import { AiProvider, PROVIDER_INFO } from "../models";

// Cloud providers use their models.dev logo; local models get a laptop icon.
export const ProviderLogo = ({
  provider,
  className,
}: {
  provider: AiProvider;
  className?: string;
}) => {
  const logo = PROVIDER_INFO[provider].logo;

  if (!logo) {
    return <LaptopIcon className={cn("size-3 shrink-0", className)} />;
  }

  return (
    <ModelSelectorLogo provider={logo} className={cn("shrink-0", className)} />
  );
};
