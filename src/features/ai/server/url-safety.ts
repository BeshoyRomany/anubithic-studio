import "server-only";

import { lookup as dnsLookup } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import {
  Agent,
  fetch as undiciFetch,
  type RequestInit as UndiciRequestInit,
} from "undici";

// A user-supplied Ollama URL is fetched by OUR server. In production it must not point
// at private or internal addresses, or users could make us call our own services (SSRF).
const PRIVATE_RANGES: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // includes the cloud metadata address 169.254.169.254
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
];

const ipv4ToNumber = (ip: string) =>
  ip.split(".").reduce((total, part) => total * 256 + Number(part), 0);

const isPrivateAddress = (ip: string) => {
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80")
    );
  }

  const value = ipv4ToNumber(ip);
  return PRIVATE_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (ipv4ToNumber(base) & mask) >>> 0;
  });
};

// Throws a user-facing message when the URL can't be used. Local dev allows anything.
export const assertSafeOllamaUrl = async (rawUrl: string) => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a full URL, like http://127.0.0.1:11434");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The URL must start with http:// or https://");
  }

  if (process.env.NODE_ENV === "development") return;

  if (url.protocol !== "https:") {
    throw new Error(
      "Use the https address from your tunnel (ngrok or Cloudflare Tunnel). See the steps below.",
    );
  }

  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new Error(
      "Local addresses can't be reached from our servers. Use your tunnel's https address (see the steps below).",
    );
  }
};

//#region Pinned fetch (DNS rebinding)
// Checking a hostname and then fetching it resolves DNS twice. A hostile DNS server can
// answer "public IP" to the check and "169.254.169.254" to the fetch (DNS rebinding).
// So in production the check runs INSIDE the connection's own DNS lookup: the address
// we validate is the address we connect to. IP-literal URLs skip DNS entirely, which is
// why assertSafeOllamaUrl above still blocks those up front.
const pinnedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error, "", 4);

    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => isPrivateAddress(address))
    ) {
      return callback(
        new Error(
          `Refusing to connect: ${hostname} resolves to a private address`,
        ),
        "",
        4,
      );
    }

    // Node asks for every address when trying IPv4/IPv6 in parallel
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
};

const pinnedAgent = new Agent({ connect: { lookup: pinnedLookup } });

// For every request to a user-supplied URL (Ollama). Redirects are refused too: a
// public URL could otherwise answer 302 → an internal address.
export const safeFetch = ((input: string | URL, init?: RequestInit) => {
  if (process.env.NODE_ENV === "development") {
    return fetch(input, { ...init, redirect: "error" });
  }
  return undiciFetch(input, {
    ...(init as UndiciRequestInit),
    redirect: "error",
    dispatcher: pinnedAgent,
  });
}) as typeof fetch;
//#endregion
