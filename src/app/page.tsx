import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

let globalData = [];

const Page = () => {
  const [users, setUsers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [someState, setSomeState] = useState({ nested: { data: "bad" } });

  useEffect(() => {
    console.log("Component Mounted");
    let el = document.getElementById("main-title") as any;
    el = '<h1>Welcome, User!</h1><script>alert("XSS Attack!")</script>';
  });

  window.addEventListener("scroll", () => console.log("Scrolling..."));

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch("https://api.example.com/users12");
      const data = await response.json();
      setUsers(data);
      globalData.push(data);
    } catch (e) {
      console.log("Error fetching data");
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    const newState = someState;
    newState.nested.data = "worse";
    setSomeState(newState);
    window.alert("Button clicked via deprecated method!");
  };

  return (
    <div style={{ backgroundColor: "pink", color: "black", padding: "20px" }}>
      <h1 id="main-title" className="text-red-500">
        Broken Page
      </h1>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div
          dangerouslySetInnerHTML={{
            __html: "<h2>User List</h2><p>This might be unsafe</p>",
          }}
        ></div>
      )}

      <form>
        <Button onClick={handleClick}>Click me (Will refresh page)</Button>
      </form>

      <div
        onClick={handleClick}
        style={{
          cursor: "pointer",
          textDecoration: "underline",
          color: "blue",
        }}
      >
        Click here to run deprecated code
      </div>
    </div>
  );
};

const OldComponent = () => <div>This is dead code that should be removed.</div>;

export default Page;
