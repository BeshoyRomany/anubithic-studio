//localhost:3001/demo
"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { useAuth } from "@clerk/nextjs";
export default function DemoPage() {
  const { userId } = useAuth();

  const [loading, setLoading] = useState<boolean>(false);
  const [loading2, setLoading2] = useState<boolean>(false);

  const handleBlocking = async () => {
    setLoading(true);
    try {
      await fetch("/api/google/blocking", { method: "POST" });
    } finally {
      setLoading(false);
    }
  };

  const handleBackground = async () => {
    setLoading2(true);
    try {
      await fetch("/api/google/background", { method: "POST" });
    } finally {
      setLoading2(false);
    }
  };

  //######### TEST SENTRY #########//
  //1) Client error - throws in the browser
  const handleClientError = () => {
    Sentry.logger.info("User attempting to click on client function", {
      userId,
    });
    throw new Error(
      "Client error: Something went wrong in the browser once again!",
    );
  };

  //2) API error - triggers server-side error
  const handleApiError = async () => {
    await fetch("/api/error/api-error", { method: "POST" });
  };

  //3) Inngest error - trigger in background job
  const handleInngestError = async () => {
    await fetch("/api/error/job-error", { method: "POST" });
  };
  //######### TEST SENTRY #########//

  return (
    <div className="p-8 space-x-4">
      <Button disabled={loading} onClick={handleBlocking}>
        {loading ? "Loading..." : "Blocking"}
      </Button>
      <Button disabled={loading2} onClick={handleBackground}>
        {loading2 ? "Loading..." : "background"}
      </Button>

      <Button variant={"destructive"} onClick={handleClientError}>
        Client error
      </Button>
      <Button variant={"destructive"} onClick={handleApiError}>
        API error
      </Button>
      <Button variant={"destructive"} onClick={handleInngestError}>
        Inngest error
      </Button>
    </div>
  );
}
