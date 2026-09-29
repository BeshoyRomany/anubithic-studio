import Link from "next/link";

import { LegalList, LegalPage, LegalSection } from "../components/legal-page";

export const TermsView = () => (
  <LegalPage
    title="Terms of Service"
    updated="September 29, 2026"
    intro="These terms apply when you use Anubithic Studio (anubithic-studio.vercel.app). By using it, you agree to them."
  >
    <LegalSection title="The service">
      <p>
        Anubithic Studio is a browser-based code editor with an AI coding
        assistant, a live preview, and GitHub import and export. We may add,
        change or remove features over time.
      </p>
    </LegalSection>

    <LegalSection title="Your account">
      <p>
        You are responsible for what happens under your account, so keep your
        sign-in safe. If you sign in with GitHub, we recommend turning on
        two-factor authentication there.
      </p>
    </LegalSection>

    <LegalSection title="Your API keys and AI costs">
      <LegalList>
        <li>
          The AI features run on your own API key from Anthropic, OpenAI or
          Google. The provider bills you directly, and its own terms apply to
          your use of its models.
        </li>
        <li>
          You are responsible for the costs made with your key. We limit how
          often and how much each feature can call your provider, but we
          recommend setting a spending limit with your provider as well.
        </li>
        <li>
          Only add keys you are allowed to use. You can delete a key at any
          time. How we protect keys is described on{" "}
          <Link href="/security" className="underline underline-offset-4 hover:text-foreground">
            How we protect your API keys
          </Link>
          .
        </li>
      </LegalList>
    </LegalSection>

    <LegalSection title="Your content">
      <p>
        You own the code and files you create or import. You allow us to
        store and process them, and to send them to the AI provider you
        choose, only to provide the service to you. See the{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Privacy Policy
        </Link>{" "}
        for details.
      </p>
    </LegalSection>

    <LegalSection title="AI output">
      <p>
        AI answers and code changes can be wrong, incomplete or insecure.
        Review them before you rely on them, especially before you deploy or
        share the code.
      </p>
    </LegalSection>

    <LegalSection title="Acceptable use">
      <p>Don&apos;t use Anubithic Studio to:</p>
      <LegalList>
        <li>break the law or infringe someone else&apos;s rights;</li>
        <li>create or spread malware, or attack other systems;</li>
        <li>
          get around rate limits, access controls or other protections, or
          access data that isn&apos;t yours;
        </li>
        <li>overload or disrupt the service for others.</li>
      </LegalList>
    </LegalSection>

    <LegalSection title="Local models">
      <p>
        If you connect your own Ollama model, you run it and the tunnel that
        exposes it. Anyone who has your tunnel address can use your model, so
        keep it private and stop the tunnel when you&apos;re not using the
        app.
      </p>
    </LegalSection>

    <LegalSection title="Shared projects">
      <p>
        Project owners decide who can join and what role they have. Each
        member&apos;s AI requests run on their own model and key.
      </p>
    </LegalSection>

    <LegalSection title="Paid plans">
      <p>
        The Pro plan is billed through Clerk, and payments are processed by
        Stripe. The price and billing terms are shown before you subscribe.
      </p>
    </LegalSection>

    <LegalSection title="No warranty">
      <p>
        Anubithic Studio is provided &quot;as is&quot;. We work to keep it
        available and secure, but we can&apos;t promise it will always be
        available, error-free or free of security issues.
      </p>
    </LegalSection>

    <LegalSection title="Limitation of liability">
      <p>
        To the extent the law allows, we are not liable for indirect or
        consequential losses, lost data or profits, or charges made with your
        API keys, arising from your use of the service.
      </p>
    </LegalSection>

    <LegalSection title="Ending your use">
      <p>
        You can stop using Anubithic Studio at any time. We may suspend or
        close accounts that break these terms.
      </p>
    </LegalSection>

    <LegalSection title="Changes to these terms">
      <p>
        When these terms change, we update them here and change the date at
        the top. Continuing to use the service means you accept the new terms.
      </p>
    </LegalSection>

    <LegalSection title="Contact">
      <p>
        For questions, use the contact details on our GitHub Marketplace
        listing.
      </p>
    </LegalSection>
  </LegalPage>
);
