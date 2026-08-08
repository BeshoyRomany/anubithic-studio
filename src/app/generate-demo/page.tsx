//localhost:3001/demo
"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function DemoPage() {
  const [loading, setLoading] = useState<boolean>(false);
  const [loading2, setLoading2] = useState<boolean>(false);

  const handleBlocking = async () => {
    setLoading(true);
    try {
      await fetch("/api/anthropic/blocking", { method: "POST" });
    } finally {
      setLoading(false);
    }
  };

  const handleBackground = async () => {
    setLoading2(true);
    try {
      await fetch("/api/anthropic/background", { method: "POST" });
    } finally {
      setLoading2(false);
    }
  };
  return (
    <div className="p-8 space-x-4">
      <Button disabled={loading} onClick={handleBlocking}>
        {loading ? "Loading..." : "Blocking"}
      </Button>
      <Button disabled={loading2} onClick={handleBackground}>
        {loading2 ? "Loading..." : "background"}
      </Button>
    </div>
  );
}
