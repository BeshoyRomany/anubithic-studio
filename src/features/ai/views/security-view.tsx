import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BanIcon,
  CheckCircle2Icon,
  FileSearchIcon,
  GaugeIcon,
  RotateCwIcon,
  TicketIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LaptopIcon,
  LockIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

// Where users check usage and cap spending, independently of us.
const PROVIDER_LINKS = [
  {
    name: "Anthropic",
    usage: "https://console.anthropic.com/settings/usage",
    limits: "https://console.anthropic.com/settings/limits",
  },
  {
    name: "OpenAI",
    usage: "https://platform.openai.com/usage",
    limits: "https://platform.openai.com/settings/organization/limits",
  },
  {
    name: "Google Gemini",
    usage: "https://aistudio.google.com/usage",
    limits: "https://console.cloud.google.com/billing",
  },
];

// Each item below is backed by an automated test or a live check (docs/security/byok.md).
const AT_A_GLANCE = [
  {
    icon: LockIcon,
    title: "Encrypted at rest",
    text: "AES-256-GCM, tied to your account and provider. Any tampering is detected.",
  },
  {
    icon: EyeOffIcon,
    title: "Never shown again",
    text: "Your key never comes back to any browser. You only see its last 4 characters.",
  },
  {
    icon: TicketIcon,
    title: "Scoped temporary passes",
    text: "Background work gets a 5-minute pass, never your API key. It's tied to one user, project, run, provider and model, allows up to 4 uses (one try plus 3 automatic retries), and stops working when the run ends.",
  },
  {
    icon: GaugeIcon,
    title: "Spending guardrails",
    text: "Rate limits and answer-length caps on every AI feature.",
  },
  {
    icon: FileSearchIcon,
    title: "Kept out of logs",
    text: "Errors are recorded without keys, code or provider responses.",
  },
  {
    icon: RotateCwIcon,
    title: "You stay in control",
    text: "Replace or delete a key and the very next request follows.",
  },
];

// Attacks we checked, with what the app does. Checked on September 27, 2026.
const TESTED_ATTACKS = [
  [
    "Someone copies the database",
    "Keys stay encrypted; the unlock secret isn't in the database",
  ],
  ["Someone edits an encrypted key in the database", "Detected and refused"],
  ["Another user tries to read, change or delete your key", "Refused"],
  [
    "A teammate uses the agent in your shared project",
    "It runs on their key, never yours",
  ],
  [
    "A stolen agent pass is used for another project, request, model or provider",
    "Refused",
  ],
  ["A pass is forged, altered or used after it expires", "Refused"],
  ["A pass is used after its request has finished", "Refused"],
  ["A pass is replayed more times than allowed", "Refused"],
  ["Someone who isn't a member of the project uses a pass", "Refused"],
  [
    "Hidden instructions in your code try to make the agent reveal your key",
    "The agent can't: it never has your key",
  ],
  [
    "Requests are sent in a flood to run up your bill",
    "Slowed down by rate limits",
  ],
  [
    "The server starts with missing or unsafe security settings",
    "It refuses to start",
  ],
];

const VERIFICATION = [
  "77 automated security tests: encryption, key rotation, temporary passes, the agent never holding your key, shared projects using each person's own key, permissions between users and projects, rate limits, and log filtering.",
  "15 attack checks run against the live app, each ending the way the table above says. Some rows are covered by several checks: a pass used for another project, request, model or provider is 4 separate checks; going over the use limit takes 4 (the 2nd to 4th uses work, the 5th is refused); and 2 checks confirm that a valid pass still works.",
  "Scans of the app logs, the database logs, the background-job records and the responses from all our attack checks: no API key or temporary pass found in any of them.",
  "A real session on our own key: chat, quick edit and suggestions worked; a deleted key was refused on the very next request; the re-saved key worked straight away.",
];

const Section = ({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof LockIcon;
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <Icon className="size-5 text-logo" />
      {title}
    </h2>
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
      {children}
    </div>
  </section>
);

// Plain-language explanation of how users' API keys are handled (Bring Your Own Key).
// Every claim here must stay literally true: see CLAUDE.md "AI layer".
export const SecurityView = () => (
  <main className="min-h-screen bg-background px-4 py-12">
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <header className="flex flex-col gap-4">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/">
            <ArrowLeftIcon className="size-4" />
            Back to Anubithic Studio
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold">How we protect your API keys</h1>
        <p className="text-muted-foreground">
          Short version: your key is encrypted before it&apos;s stored,
          it&apos;s never sent back to your browser, and it&apos;s only used for
          your own requests. You stay in control: you can set a spending limit
          with your provider and switch the key off at any time.
        </p>
        <p className="text-xs text-muted-foreground">
          Last updated September 28, 2026. This page describes how the app works
          today, and we update it when that changes.
        </p>
      </header>

      <section
        aria-label="Security at a glance"
        className="grid gap-3 sm:grid-cols-2"
      >
        {AT_A_GLANCE.map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="flex gap-3 rounded-md border border-foreground/10 p-3"
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-logo" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{title}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {text}
              </span>
            </div>
          </div>
        ))}
      </section>

      <Section icon={LockIcon} title="When you save a key">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          <li>
            We check it works with a free request to your provider. A key that
            doesn&apos;t work is never stored.
          </li>
          <li>
            Our server encrypts it with AES-256-GCM, which also detects any
            tampering, and ties it to your account and provider. The secret used
            to encrypt it lives on our application server, not in the database,
            so a copy of the database alone can&apos;t unlock any key. We can
            replace that secret over time without asking you to re-enter your
            key.
          </li>
          <li>
            We store only the encrypted key, plus its last 4 characters (like
            &quot;card ending in 1234&quot;) so you can tell which key you
            saved.
          </li>
          <li>The key is never sent back to your browser, not even to you.</li>
          <li>
            We keep an internal record of when your key was saved, replaced or
            deleted. The record never contains the key itself.
          </li>
        </ol>
      </Section>

      <Section icon={KeyRoundIcon} title="When your key is used">
        <p>
          Only when you use an AI feature: the coding agent, quick edit, or code
          suggestions. Our server unlocks the key for that one request and sends
          it straight to your provider.
        </p>
        <p>
          The service that runs the coding agent in the background never
          receives your key. It gets a signed temporary pass instead, which our
          server swaps for your key. The pass only works for your current agent
          request: one model, one project, up to 4 uses (one try and 3
          automatic retries), for up to 5 minutes, and it stops working as soon
          as that request finishes.
        </p>
        <p>
          Because the agent never has your key, it can&apos;t reveal it, even
          if code or text in your project tries to trick it into doing so. The
          most a tricked agent could do is use its current pass, which ends
          when that request finishes. The agent can read your project&apos;s
          files, though, so never paste a key into your code.
        </p>
        <p>
          We limit how often and how much each feature can call your provider,
          and cap the length of every answer, so a mistake or misuse can&apos;t
          run up a large bill quickly. The API keys panel shows when each key
          was last used, so you can spot anything you didn&apos;t expect.
        </p>
        <p>
          Nothing keeps a copy of your unlocked key between requests. When you
          replace or delete a key, the very next request uses the new key, or
          none at all.
        </p>
      </Section>

      <Section icon={UsersIcon} title="In shared projects">
        <p>
          Each person pays for their own requests. When a teammate asks the
          agent something, it runs on their model and their key, never yours.
        </p>
        <p>
          We check that the person is still a member of the project on every
          step of the agent&apos;s work. If someone is removed from a project,
          their running request stops being able to use AI straight away.
        </p>
      </Section>

      <Section icon={EyeOffIcon} title="What we never do">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            Write your key to our logs. When an AI request fails, we record only
            the provider, model, error type and status, never your key, your
            code, or the provider&apos;s full response.
          </li>
          <li>
            Send request data to our error-reporting tool. Its collection of
            request bodies, headers and AI prompts is switched off. A filter
            also removes anything that looks like a key from our logs and error
            reports, as a second safety net.
          </li>
          <li>Use your key for anyone else&apos;s requests.</li>
          <li>
            Send it anywhere except the AI provider it belongs to. Provider API
            keys are never placed in URLs; the key travels to that provider
            only inside a request header.
          </li>
        </ul>
      </Section>

      <Section icon={BanIcon} title="Attacks we tested against">
        <p>
          We didn&apos;t just design these protections, we attacked them. Every
          row is covered by automated tests, and the temporary-pass attacks and
          the startup check were also run against the live app:
        </p>
        <div className="overflow-hidden rounded-md border border-foreground/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-foreground/5 text-foreground">
              <tr>
                <th className="p-2 font-medium">If someone tries to…</th>
                <th className="p-2 font-medium">What happens</th>
              </tr>
            </thead>
            <tbody>
              {TESTED_ATTACKS.map(([attack, result]) => (
                <tr key={attack} className="border-t border-foreground/10">
                  <td className="p-2 align-top">{attack}</td>
                  <td className="p-2 align-top">
                    <span className="flex items-start gap-1.5 text-foreground">
                      <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-green-500" />
                      {result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section icon={FileSearchIcon} title="How we verified it">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          {VERIFICATION.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="text-xs">
          Automated tests from September 28, 2026; live checks from September
          27, 2026. Tests show that these protections
          work as described; they can&apos;t prove that no problem exists, which
          is why the steps below still matter.
        </p>
      </Section>

      <Section
        icon={ShieldCheckIcon}
        title="You don't have to take our word for it"
      >
        <p>
          To be straight with you: our server has to handle your key to call
          your provider, so no website can prove that it never looks at it.
          That&apos;s why we recommend these steps. They protect you without
          relying on us:
        </p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <span className="text-foreground">
              Create a key just for Anubithic Studio.
            </span>{" "}
            Then your provider&apos;s usage page shows exactly what was done
            with it.
          </li>
          <li>
            <span className="text-foreground">
              Set a monthly spending limit
            </span>{" "}
            with your provider. Even in the worst case, you can&apos;t be
            charged more than the amount you chose.
          </li>
          <li>
            <span className="text-foreground">Check your usage.</span> It should
            only grow when you use the app.
          </li>
          <li>
            <span className="text-foreground">
              Protect your Anubithic account.
            </span>{" "}
            If you sign in with GitHub, turn on two-factor authentication there.
            Otherwise, use a strong password you don&apos;t use anywhere else.
            Check the signed-in devices under Manage account, then Security.
          </li>
          <li>
            <span className="text-foreground">Revoke it any time.</span> Delete
            it in the API keys panel, and revoke it in your provider&apos;s
            console. It stops working immediately.
          </li>
        </ul>
        <div className="flex flex-col gap-1 rounded-md border border-foreground/10 p-3">
          {PROVIDER_LINKS.map(({ name, usage, limits }) => (
            <p key={name}>
              <span className="text-foreground">{name}:</span>{" "}
              <a
                href={usage}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                usage
              </a>{" "}
              ·{" "}
              <a
                href={limits}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                spending limits
              </a>
            </p>
          ))}
        </div>
      </Section>

      <Section icon={LaptopIcon} title="Prefer not to share a key?">
        <p>
          Run a model on your own machine with Ollama and connect it as a local
          model. It needs no API key, and nothing is billed per request. Our
          server calls your model at the web address you enter, so that address
          must be reachable from the internet, for example through a tunnel.
          Your prompts, code and the model&apos;s answers pass through our
          server on the way. They&apos;re handled like a cloud model&apos;s:
          your chat is saved in your project, and the background service that
          runs the agent keeps a history of each run. Nothing else keeps a
          copy.
        </p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            The same checks apply: temporary passes, project membership, rate
            limits, answer-length caps and log filtering.
          </li>
          <li>
            We only call public addresses, never follow redirects, and re-check
            the address when connecting, so it can&apos;t be used to reach our
            own internal network.
          </li>
          <li>
            Ollama has no password, so anyone who finds your address can use
            your model. Use a long, hard-to-guess tunnel address and stop the
            tunnel when you&apos;re not using the app.
          </li>
        </ul>
      </Section>

      <Section icon={AlertTriangleIcon} title="What we can't protect against">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            If someone gets hold of your key outside our app, for example from
            your own computer, only revoking it at your provider stops them.
          </li>
          <li>
            If someone signs in to your Anubithic account, they can&apos;t see
            your key, but they can use it for requests until you sign them out
            or delete the key. Under Manage account, then Security, you can see
            the devices signed in to your account and sign them out.
          </li>
        </ul>
        <p>
          We test these protections with automated security tests, and we review
          this page whenever the way we handle keys changes.
        </p>
      </Section>
    </div>
  </main>
);
