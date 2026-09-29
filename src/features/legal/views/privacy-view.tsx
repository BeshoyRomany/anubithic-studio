import Link from "next/link";

import { Em, LegalList, LegalPage, LegalSection } from "../components/legal-page";

// Who receives what. Keep in sync with the services the code actually calls.
const SERVICES = [
  ["Clerk", "Sign-in, account details and Pro plan billing (payments are processed by Stripe)"],
  ["Convex", "Database: your projects, files, chats, settings and encrypted API keys"],
  ["Inngest", "Runs the coding agent in the background and keeps a history of each run, including prompts and project content"],
  ["Vercel", "Hosts the app and serves its files"],
  ["Sentry", "Error reports and performance traces, without request bodies, auth headers or AI prompts"],
  ["Firecrawl", "Fetches web pages whose links you include in a prompt"],
  ["GitHub", "Imports and exports repositories when you ask it to"],
  ["StackBlitz WebContainers", "Runs your project's live preview inside your browser"],
  ["Anthropic, OpenAI or Google", "Only the provider you choose receives your prompts and code, using your own API key"],
];

export const PrivacyView = () => (
  <LegalPage
    title="Privacy Policy"
    updated="September 29, 2026"
    intro="This policy explains what Anubithic Studio (anubithic-studio.vercel.app) collects, why we collect it, and who it is shared with."
  >
    <LegalSection title="What we collect">
      <LegalList>
        <li>
          <Em>Account details:</Em> your name, email address and profile
          picture from your sign-in (email or GitHub), and whether you are on
          the free or Pro plan.
        </li>
        <li>
          <Em>Your projects:</Em> files and folders, chats with the AI,
          project members and invitations.
        </li>
        <li>
          <Em>AI settings:</Em> the model you picked, your API keys in
          encrypted form with their last 4 characters and the dates they were
          saved and last used, and your local model&apos;s address and name.
        </li>
        <li>
          <Em>Security records:</Em> a log of when a key was saved, replaced
          or deleted (never the key itself), and request counters used for
          rate limits.
        </li>
        <li>
          <Em>Technical data:</Em> error reports and performance traces. For
          10% of sessions, and sessions where an error happens, a short
          session recording is kept with all text, form inputs and media
          hidden. Our host keeps standard request logs.
        </li>
      </LegalList>
    </LegalSection>

    <LegalSection title="How we use it">
      <LegalList>
        <li>
          To run the editor: store your files, run the AI features, show the
          live preview, and import or export GitHub repositories.
        </li>
        <li>
          To keep the service safe: rate limits, the key audit log, and error
          monitoring.
        </li>
        <li>We don&apos;t sell your data or use it for advertising.</li>
        <li>We don&apos;t use your code or chats to train AI models.</li>
      </LegalList>
    </LegalSection>

    <LegalSection title="AI providers and your API keys">
      <p>
        When you use an AI feature, your prompt, the relevant project files
        and recent chat history are sent to the AI provider you chose, using
        your own API key. That provider&apos;s own terms and privacy policy
        apply to what it receives. With a local model, the same data goes to
        your own Ollama server at the address you entered.
      </p>
      <p>
        Links you include in a prompt are fetched through Firecrawl so the AI
        can read them.
      </p>
      <p>
        Your API keys are encrypted before they are stored and are never sent
        back to your browser. The full details are on{" "}
        <Link href="/security" className="underline underline-offset-4 hover:text-foreground">
          How we protect your API keys
        </Link>
        .
      </p>
    </LegalSection>

    <LegalSection title="Services we share data with">
      <div className="overflow-hidden rounded-md border border-foreground/10">
        <table className="w-full text-left text-xs">
          <thead className="bg-foreground/5 text-foreground">
            <tr>
              <th className="p-2 font-medium">Service</th>
              <th className="p-2 font-medium">What it does for us</th>
            </tr>
          </thead>
          <tbody>
            {SERVICES.map(([name, purpose]) => (
              <tr key={name} className="border-t border-foreground/10">
                <td className="p-2 align-top text-foreground">{name}</td>
                <td className="p-2 align-top">{purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Each service only receives what it needs for its part.</p>
    </LegalSection>

    <LegalSection title="Where your data is stored">
      <LegalList>
        <li>
          Your account and project data are stored by Convex in the European
          Union (Ireland).
        </li>
        <li>Error reports are stored by Sentry in the European Union (Germany).</li>
        <li>
          Clerk, Vercel, Inngest and Firecrawl are based in the United States,
          as are Anthropic, OpenAI and Google, so data they handle may be
          processed there.
        </li>
        <li>With a local model, your prompts go to your own computer.</li>
      </LegalList>
    </LegalSection>

    <LegalSection title="Cookies and browser storage">
      <p>
        We use the sign-in cookies Clerk needs to keep you logged in, and
        store your light or dark theme choice in your browser. We don&apos;t
        use advertising or tracking cookies.
      </p>
    </LegalSection>

    <LegalSection title="How long we keep data, and deleting it">
      <LegalList>
        <li>We keep your data while your account is active.</li>
        <li>
          Deleting a project deletes its files, chats and invitations.
        </li>
        <li>
          Deleting an API key removes it right away; replacing one removes the
          old one.
        </li>
        <li>
          Error reports and agent run history are kept for the retention
          periods of Sentry and Inngest.
        </li>
        <li>
          To delete your account and everything linked to it, contact us
          (below).
        </li>
      </LegalList>
    </LegalSection>

    <LegalSection title="Children">
      <p>Anubithic Studio is not meant for children under 13.</p>
    </LegalSection>

    <LegalSection title="Changes to this policy">
      <p>
        When this policy changes, we update it here and change the date at the
        top.
      </p>
    </LegalSection>

    <LegalSection title="Contact">
      <p>
        For questions or deletion requests, use the contact details on our
        GitHub Marketplace listing.
      </p>
    </LegalSection>
  </LegalPage>
);
