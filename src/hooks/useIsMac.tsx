import { useEffect, useState } from "react";

export function useIsMac() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const isMacPlatform =
      /Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
      /Mac/.test(navigator.userAgent);
    setIsMac(isMacPlatform);
  }, []);

  return isMac;
}
