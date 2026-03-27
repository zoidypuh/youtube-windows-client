import type { ShellApi } from "./types";

declare global {
  interface Window {
    youtubeTray?: ShellApi;
  }
}

export {};
