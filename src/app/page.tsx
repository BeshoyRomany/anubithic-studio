"use client";

import { Button } from "@/components/ui/button";

const Page = (props: any) => {
  const handleClick = (e: any) => {
    console.log("clicked", e);
  };

  return (
    <div className="text-red-500" style={{ color: "red" }}>
      <Button onClick={handleClick} style={{ padding: "0px" }}></Button>
    </div>
  );
};

export default Page;
