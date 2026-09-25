import ky, { HTTPError } from "ky";
import { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { useClerk } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

import { FaGithub } from "react-icons/fa";

import { Dialog } from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

import { Id } from "../../../../convex/_generated/dataModel";
import { GlowDialogContent, GlowDialogHeader } from "./glow-dialog";

const formSchema = z.object({
  url: z.url("Please enter a valid URL"),
});

interface ImportGithubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ImportGithubDialog = ({
  open,
  onOpenChange,
}: ImportGithubDialogProps) => {
  const router = useRouter();
  const { openUserProfile } = useClerk();

  const form = useForm({
    defaultValues: {
      url: "",
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const { projectId } = await ky
          .post("/api/github/import", {
            json: { url: value.url },
          })
          .json<{
            success: boolean;
            projectId: Id<"projects">;
            eventId: string;
          }>();

        toast.success("Importing repository...");
        onOpenChange(false);
        form.reset();

        router.push(`/projects/${projectId}`);
      } catch (error) {
        // Is the current error type HTTPError from ky due to a failed request?
        if (error instanceof HTTPError) {
          // Unlocking the raw response stream and parsing it into a JavaScript object containing the error message.
          const body = await error.response.json<{
            error: string;
            code: string;
          }>();
          if (body.code === "PRO_PLAN_REQUIRED") {
            toast.error("Upgrade to import repositories", {
              action: {
                label: "Upgrade",
                onClick: () => openUserProfile(),
              },
            });
            onOpenChange(false);
            return;
          }

          if (body.code === "GITHUB_MISSING") {
            toast.error("GitHub account not connected", {
              action: {
                label: "Connect",
                onClick: () => openUserProfile(),
              },
            });
            onOpenChange(false);
            return;
          }
        }
        toast.error(
          "Unable to import repository. Please check the URL and try again",
        );
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <GlowDialogContent>
        <GlowDialogHeader
          title="Import from GitHub"
          description="Paste a repository URL — a new project will be created with its contents."
          icon={<FaGithub aria-hidden className="size-6 shrink-0 text-logo" />}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <form.Field name="url">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid} className="px-5 pt-4 pb-5">
                  <FieldLabel
                    htmlFor={field.name}
                    className="text-xs text-muted-foreground"
                  >
                    Repository URL
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                    placeholder="https://github.com/owner/repo"
                    autoComplete="off"
                    className="h-10 rounded-lg border-white/10 bg-white/3! placeholder:text-muted-foreground/60 focus-visible:border-logo/60 focus-visible:ring-logo/20"
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          </form.Field>
          <div className="flex items-center justify-between gap-2 border-t border-white/5 px-5 py-3">
            <span className="text-[11px] text-muted-foreground/60">
              Public or private repos you have access to
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="rounded-lg text-muted-foreground"
              >
                Cancel
              </Button>
              <form.Subscribe
                selector={(state) => [state.canSubmit, state.isSubmitting]}
              >
                {([canSubmit, isSubmitting]) => (
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!canSubmit || isSubmitting}
                    className="rounded-lg bg-logo text-black hover:bg-logo/90 disabled:bg-muted disabled:text-muted-foreground"
                  >
                    {isSubmitting ? "Importing..." : "Import"}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </div>
        </form>
      </GlowDialogContent>
    </Dialog>
  );
};
