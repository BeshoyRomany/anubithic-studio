"use client";
import { useEffect, useRef } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { useTheme } from "next-themes";
import { FitAddon } from "@xterm/addon-fit";

import "@xterm/xterm/css/xterm.css";

const DARK_THEME: ITheme = { background: "#1f2228" };

//One Light ANSI colors, readable on a light background
const LIGHT_THEME: ITheme = {
  background: "#f5f2ea",
  foreground: "#383a42",
  cursor: "#526eff",
  selectionBackground: "#d7dbe8",
  black: "#383a42",
  red: "#e45649",
  green: "#50a14f",
  yellow: "#c18401",
  blue: "#4078f2",
  magenta: "#a626a4",
  cyan: "#0184bc",
  white: "#a0a1a7",
  brightBlack: "#696c77",
  brightRed: "#e45649",
  brightGreen: "#50a14f",
  brightYellow: "#c18401",
  brightBlue: "#4078f2",
  brightMagenta: "#a626a4",
  brightCyan: "#0184bc",
  brightWhite: "#383a42",
};

interface PreviewTerminalProps {
  output: string;
}

export const PreviewTerminal = ({ output }: PreviewTerminalProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastLengthRef = useRef(0);

  const { resolvedTheme } = useTheme();
  const terminalTheme = resolvedTheme === "light" ? LIGHT_THEME : DARK_THEME;
  const terminalThemeRef = useRef(terminalTheme);

  // Initialize terminal
  useEffect(() => {
    // Abort execution if the DOM container ref is not attached yet or the terminal instance already exists
    if (!containerRef.current || terminalRef.current) return;

    // Instantiate a new xterm Terminal object with custom user interface and behavior configurations
    const terminal = new Terminal({
      convertEol: true,
      disableStdin: true,
      fontSize: 12,
      fontFamily: "monospace",
      theme: terminalThemeRef.current,
    });

    // Initialize and fit the terminal instance to the container's current dimensions
    const fitAddon = new FitAddon();

    // Load the fit addon utility into the terminal instance
    terminal.loadAddon(fitAddon);

    // Mount and render the terminal view inside the target DOM container element
    terminal.open(containerRef.current);

    // Persist the active terminal and fit addon instances into their respective refs
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Write existing output on mount
    if (output) {
      terminal.write(output);
      lastLengthRef.current = output.length;
    }

    // Defer the initial dimension fitting to the next animation frame for accurate layout calculations
    requestAnimationFrame(() => fitAddon.fit());

    // Create a resize observer to automatically re-fit the terminal dimensions when container size changes
    const resizeObserver = new ResizeObserver(() => fitAddon.fit());

    // Start observing the container element for width and height layout changes
    resizeObserver.observe(containerRef.current);

    // Return a cleanup function to dispose of observers and terminal instances when component unmounts
    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
    // "output" does not need to be a dependency since it is not intended
    // to update anything, just used on mount
  }, []);

  // Follow the app theme
  useEffect(() => {
    terminalThemeRef.current = terminalTheme;
    if (terminalRef.current) terminalRef.current.options.theme = terminalTheme;
  }, [terminalTheme]);

  // Write output
  useEffect(() => {
    // Ensure the terminal instance exists before trying to write any output
    if (!terminalRef.current) return;

    // If the new output length is less than the previous one, the buffer was reset; clear the terminal screen
    if (output.length < lastLengthRef.current) {
      terminalRef.current.clear();
      lastLengthRef.current = 0;
    }

    // Extract only the newly appended text chunks from the output string
    const newData = output.slice(lastLengthRef.current);
    if (newData) {
      // Write the new incremental data to the terminal and update our length tracker reference
      terminalRef.current.write(newData);
      lastLengthRef.current = output.length;
    }
  }, [output]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 p-3 [&_.xterm]:h-full! [&_.xterm-viewport]:h-full! [&_.xterm-screen]:h-full! bg-sidebar"
    />
  );
};
