import type { Metadata } from "next";

import { PrivacyView } from "@/features/legal/views/privacy-view";

export const metadata: Metadata = {
  title: "Privacy Policy · Anubithic Studio",
};

// Public page, linked from the GitHub Marketplace listing
const Page = () => <PrivacyView />;

export default Page;
