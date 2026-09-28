import type { Metadata } from "next";

import { SecurityView } from "@/features/ai/views/security-view";

export const metadata: Metadata = {
  title: "How we protect your API keys · Anubithic Studio",
};

// Public page linked from the API keys panel
const Page = () => <SecurityView />;

export default Page;
