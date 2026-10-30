/**
 * Host half of the tariff title-bar plugin.
 *
 * It exposes one read-only route that answers the account-wide token total
 * using the DSH account grant. The browser half only talks to this route; the
 * grant token and platform cookies never leave the Host process.
 */

const ROUTE = "/dsh-tariff/account-usage";
const PLATFORM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};
/** Platform usage windows are capped at 31 days. */
const WINDOW_SECONDS = 31 * 86400;
const HISTORY_START = Math.floor(new Date(2023, 0, 1).getTime() / 1000);
const CACHE_MS = 10 * 60 * 1000;
const CONCURRENCY = 5;

export const name = "@local/dsh-tariff-titlebar";
export const inject = ["webServer", "deepseekAccount"];

/** Send one JSON response. */
function sendJson(res, body) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/** Browser-side headers a platform request must carry, plus the Host grant. */
function platformRequestHeaders(session) {
  const extra = {};
  for (const [key, value] of Object.entries(session.requestHeaders || {})) {
    const name = key.toLowerCase();
    if (name === "host" || name === "content-length" || name === "content-type") continue;
    extra[key] = value;
  }
  return {
    ...extra,
    ...PLATFORM_HEADERS,
    Origin: session.origin,
    Referer: session.origin + "/usage",
    "x-dsh-auth-token": session.token,
  };
}

/** Count tokens in one series bucket. */
function bucketTokens(usage) {
  if (!usage || typeof usage !== "object") return 0;
  return (
    (Number(usage.PROMPT_CACHE_HIT_TOKEN) || 0) +
    (Number(usage.PROMPT_CACHE_MISS_TOKEN) || 0) +
    (Number(usage.RESPONSE_TOKEN ?? usage.COMPLETION_TOKEN) || 0)
  );
}

/** Sum one 31-day window, returning token totals. */
async function fetchWindow(session, headers, start, end, tz) {
  const url =
    session.origin +
    "/api/v0/usage/by_api_key/amount?start=" +
    start +
    "&end=" +
    end +
    "&tz=" +
    tz;
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error("platform HTTP " + response.status);
  const payload = await response.json();
  const data = payload && payload.data;
  if (!data || data.biz_code !== 0 || !data.biz_data) {
    throw new Error(
      "platform rejected usage query: " +
        ((data && data.biz_msg) || payload.msg || "unknown"),
    );
  }
  let tokens = 0;
  for (const series of data.biz_data.series || []) {
    for (const bucket of series.buckets || []) {
      tokens += bucketTokens(bucket.usage);
    }
  }
  return tokens;
}

/** Fetch every 31-day window in the account history. */
async function readAccountUsage(ctx) {
  const session = await ctx.deepseekAccount.getPlatformSession();
  if (!session || !session.token) {
    return { ok: false, error: "not signed in" };
  }
  const headers = platformRequestHeaders(session);
  const tz = -new Date().getTimezoneOffset() * 60;
  const now = new Date();
  const end = Math.floor(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() /
      1000,
  );
  const windows = [];
  let cursor = end;
  while (cursor > HISTORY_START) {
    const start = Math.max(HISTORY_START, cursor - WINDOW_SECONDS);
    windows.push([start, cursor]);
    cursor = start;
  }
  let tokens = 0;
  for (let index = 0; index < windows.length; index += CONCURRENCY) {
    const batch = windows.slice(index, index + CONCURRENCY);
    const results = await Promise.all(
      batch.map(([start, finish]) =>
        fetchWindow(session, headers, start, finish, tz),
      ),
    );
    for (const value of results) tokens += value;
  }
  return {
    ok: true,
    total: tokens,
    from: HISTORY_START,
    to: end,
    windows: windows.length,
    computedAt: Date.now(),
  };
}

export function apply(ctx) {
  let cached = null;
  let running = null;
  const read = () => {
    if (cached !== null && Date.now() - cached.at < CACHE_MS) {
      return Promise.resolve(cached.value);
    }
    if (running !== null) return running;
    running = readAccountUsage(ctx)
      .then((value) => {
        if (value.ok) cached = { at: Date.now(), value };
        return value;
      })
      .catch((error) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }))
      .finally(() => {
        running = null;
      });
    return running;
  };
  ctx.effect(() =>
    ctx.webServer.register({
      kind: "exact",
      path: ROUTE,
      handler: async (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          sendJson(res, await read());
        } catch (error) {
          sendJson(res, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    }),
  );
}
