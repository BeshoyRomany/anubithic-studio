import type { Metadata } from "next";

import { TermsView } from "@/features/legal/views/terms-view";

export const metadata: Metadata = {
  title: "Terms of Service · Anubithic Studio",
};

// Public page, linked from the GitHub Marketplace listing
const Page = () => <TermsView />;

export default Page;
