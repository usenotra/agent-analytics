import type { Provider } from "@usenotra/agent-analytics";

export const PROVIDERS: Provider[] = [
  "chatgpt",
  "claude-code",
  "claude",
  "diffbot",
  "shap",
  "perplexity",
  "gemini",
  "copilot",
];

export const PROVIDER_META: Record<
  Provider,
  { label: string; color: string }
> = {
  chatgpt: { label: "ChatGPT", color: "oklch(0.7 0.16 165)" },
  "claude-code": { label: "Claude Code", color: "oklch(0.64 0.18 42)" },
  claude: { label: "Claude", color: "oklch(0.74 0.15 55)" },
  diffbot: { label: "Diffbot", color: "oklch(0.68 0.15 115)" },
  shap: { label: "Shap", color: "oklch(0.66 0.14 300)" },
  perplexity: { label: "Perplexity", color: "oklch(0.72 0.13 200)" },
  gemini: { label: "Gemini", color: "oklch(0.68 0.17 265)" },
  copilot: { label: "Copilot", color: "oklch(0.72 0.16 320)" },
};

export type ProviderStat = {
  provider: Provider;
  label: string;
  color: string;
  count: number;
};

export type DailyPoint = { date: string } & Partial<Record<Provider, number>>;

export type PathStat = {
  path: string;
  count: number;
  agents?: ProviderStat[];
};

export type AcceptStat = {
  accept: string;
  total: number;
  providers: ProviderStat[];
};
