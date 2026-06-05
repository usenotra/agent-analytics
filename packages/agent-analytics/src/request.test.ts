import { describe, expect, test } from "bun:test";

import { eventFromRequest } from "./request.ts";

describe("eventFromRequest", () => {
  test("captures the normalized Accept header", () => {
    const event = eventFromRequest(
      new Request("https://upstash.com/blog#section", {
        headers: {
          "user-agent": "ClaudeBot/1.0",
          accept: " Text/Markdown, text/html;q=0.8 ",
        },
      }),
    );

    expect(event).toEqual({
      provider: "claude",
      path: "https://upstash.com/blog",
      accept: "text/markdown, text/html;q=0.8",
    });
  });

  test("omits Accept when the header is missing", () => {
    const event = eventFromRequest(
      new Request("https://upstash.com/docs", {
        headers: { "user-agent": "ClaudeBot/1.0" },
      }),
    );

    expect(event?.accept).toBeUndefined();
  });

  test("detects Claude Code before the generic Claude bucket", () => {
    const event = eventFromRequest(
      new Request("https://upstash.com/docs", {
        headers: {
          "user-agent":
            "Claude-User (claude-code/2.1.165; +https://support.anthropic.com/)",
          accept: "text/markdown, text/html, */*",
        },
      }),
    );

    expect(event).toEqual({
      provider: "claude-code",
      path: "https://upstash.com/docs",
      accept: "text/markdown, text/html, */*",
    });
  });

  test("detects Diffbot as its own provider", () => {
    const event = eventFromRequest(
      new Request("https://upstash.com/docs", {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.1745.70 Safari/537.36 Diffbot-User/0.1 (+http://www.diffbot.com)",
          referer: "http://news.google.com/",
        },
      }),
    );

    expect(event).toEqual({
      provider: "diffbot",
      path: "https://upstash.com/docs",
      accept: undefined,
    });
  });

  test("detects Shap user and bot requests as one provider", () => {
    const userEvent = eventFromRequest(
      new Request("https://upstash.com/docs", {
        headers: {
          "user-agent":
            "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Shap-User/0.1.0",
        },
      }),
    );
    const botEvent = eventFromRequest(
      new Request("https://upstash.com/docs", {
        headers: {
          "user-agent":
            "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ShapBot/0.1.0",
        },
      }),
    );

    expect(userEvent?.provider).toBe("shap");
    expect(botEvent?.provider).toBe("shap");
  });
});
