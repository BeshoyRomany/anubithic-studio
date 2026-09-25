"use client";

import { Dialog } from "@/components/ui/dialog";

import { GlowDialogContent, GlowDialogHeader } from "./glow-dialog";
import { NewProjectPrompt } from "./new-project-prompt";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewProjectDialog = ({
  open,
  onOpenChange,
}: NewProjectDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <GlowDialogContent>
        <GlowDialogHeader
          title="What do you want to build?"
          description="Describe your project and Anubithic will bring it to life."
        />
        <NewProjectPrompt onCreated={() => onOpenChange(false)} />
      </GlowDialogContent>
    </Dialog>
  );
};
