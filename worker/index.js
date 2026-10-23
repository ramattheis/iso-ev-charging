const APP_TIME_ZONE = "America/New_York";
const MAX_BODY_BYTES = 4096;
const MAX_NAME_LENGTH = 50;
const MAX_OFFERS_PER_DAY = 100;
const LOCATION_IDS = new Set(["holyoke", "windsor"]);

const API_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

class HttpError extends Error {
  constructor(status, message, code = "request_failed") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...API_HEADERS, ...extraHeaders },
  });
}

function easternClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    day: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    nowIso: date.toISOString(),
  };
}

function cleanName(value) {
  const name = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new HttpError(400, `Names must be between 1 and ${MAX_NAME_LENGTH} characters.`, "invalid_name");
  }
  return name;
}

function cleanId(value) {
  const id = String(value ?? "");
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) {
    throw new HttpError(400, "That offer ID is invalid.", "invalid_offer_id");
  }
  return id;
}

function cleanTime(value, currentTime) {
  const time = String(value ?? "");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new HttpError(400, "Please choose a valid handoff time.", "invalid_time");
  }
  if (time <= currentTime) {
    throw new HttpError(400, "Please choose a time later today.", "time_in_past");
  }
  return time;
}

function cleanPressureCount(value) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new HttpError(
      400,
      "The status on this page is out of date. Please refresh and try again.",
      "invalid_status_version"
    );
  }
  return count;
}

function cleanLocation(value) {
  const location = String(value ?? "holyoke").toLowerCase();
  if (!LOCATION_IDS.has(location)) {
    throw new HttpError(400, "That campus is not supported.", "invalid_location");
  }
  return location;
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "That request is too large.", "request_too_large");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "That request is too large.", "request_too_large");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "The request was not valid JSON.", "invalid_json");
  }
}

function requestKeys(request) {
  const clientHeader = request.headers.get("x-ev-client-id") || "";
  const clientId = /^[a-zA-Z0-9-]{8,80}$/.test(clientHeader) ? clientHeader : "missing-client-id";
  const ip = request.headers.get("cf-connecting-ip") || "local";
  return { clientId, ip };
}

async function applyRateLimits(request, env, isWrite) {
  const { clientId, ip } = requestKeys(request);
  const checks = [
    env.CLIENT_RATE_LIMITER.limit({ key: clientId }),
    env.IP_RATE_LIMITER.limit({ key: ip }),
    env.GLOBAL_API_RATE_LIMITER.limit({ key: "all-api-traffic" }),
  ];
  if (isWrite) checks.push(env.WRITE_RATE_LIMITER.limit({ key: clientId }));
  const results = await Promise.all(checks);
  if (results.some(({ success }) => !success)) {
    throw new HttpError(429, "Too many updates. Please wait a minute and try again.", "rate_limited");
  }
}

function assertSameOrigin(request) {
  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;
  const origin = request.headers.get("origin");
  if (!origin || origin !== url.origin) {
    throw new HttpError(403, "Cross-site updates are not allowed.", "cross_site_request");
  }
}

async function cleanupOldDays(db, today) {
  await db.batch([
    db.prepare("DELETE FROM offers WHERE day < ?1").bind(today),
    db.prepare("DELETE FROM daily_state WHERE day < ?1").bind(today),
  ]);
}

async function getState(db, location, clock = easternClock()) {
  const [dailyResult, offersResult] = await db.batch([
    db.prepare(
      `SELECT
         status,
         pressure_count,
         updated_at AS statusUpdatedAt
       FROM daily_state
       WHERE day = ?1 AND location = ?2
       LIMIT 1`
    ).bind(clock.day, location),
    db.prepare(
      `SELECT
         id,
         offered_by AS offeredBy,
         handoff_time AS time,
         claimed_by AS claimedBy
       FROM offers
       WHERE day = ?1
         AND location = ?2
         AND handoff_time > ?3
         AND removed_at IS NULL
       ORDER BY handoff_time ASC, created_at ASC
       LIMIT ?4`
    ).bind(clock.day, location, clock.time, MAX_OFFERS_PER_DAY),
  ]);
  const daily = dailyResult.results?.[0];
  return {
    day: clock.day,
    location,
    status: daily?.status === "congested" ? "congested" : "slack",
    pressureCount: Number(daily?.pressure_count || 0),
    statusUpdatedAt: daily?.statusUpdatedAt || null,
    offers: (offersResult.results || []).map((offer) => ({
      ...offer,
      claimedBy: offer.claimedBy || "",
    })),
    serverTime: clock.nowIso,
  };
}

async function mutate(db, body, clock, location) {
  const action = String(body?.action || "");
  await cleanupOldDays(db, clock.day);

  switch (action) {
    case "request_spot":
      await db.prepare(
        `INSERT INTO daily_state (day, location, status, pressure_count, updated_at)
         VALUES (?1, ?2, 'congested', 1, ?3)
         ON CONFLICT(day, location) DO UPDATE SET
           status = 'congested',
           pressure_count = daily_state.pressure_count + 1,
           updated_at = excluded.updated_at`
      ).bind(clock.day, location, clock.nowIso).run();
      break;

    case "set_slack": {
      const expectedPressureCount = cleanPressureCount(body.expectedPressureCount);
      const result = await db.prepare(
        `UPDATE daily_state
         SET status = 'slack', updated_at = ?1
         WHERE day = ?2
           AND location = ?3
           AND status = 'congested'
           AND pressure_count = ?4`
      ).bind(clock.nowIso, clock.day, location, expectedPressureCount).run();
      if (Number(result.meta?.changes || 0) !== 1) {
        throw new HttpError(
          409,
          "The charging status changed while you were confirming. Please review the latest status before trying again.",
          "status_changed"
        );
      }
      break;
    }

    case "create_offer": {
      const offeredBy = cleanName(body.offeredBy);
      const handoffTime = cleanTime(body.time, clock.time);
      const count = await db.prepare(
        `SELECT COUNT(*) AS count
         FROM offers
         WHERE day = ?1
           AND location = ?2
           AND removed_at IS NULL
           AND handoff_time > ?3`
      ).bind(clock.day, location, clock.time).first("count");
      if (Number(count || 0) >= MAX_OFFERS_PER_DAY) {
        throw new HttpError(409, "There are already too many active offers today.", "offer_limit_reached");
      }
      await db.prepare(
        `INSERT INTO offers
          (id, day, location, offered_by, handoff_time, claimed_by, created_at, updated_at, removed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?6, NULL)`
      ).bind(crypto.randomUUID(), clock.day, location, offeredBy, handoffTime, clock.nowIso).run();
      break;
    }

    case "claim_offer": {
      const result = await db.prepare(
        `UPDATE offers
         SET claimed_by = ?1, updated_at = ?2
         WHERE id = ?3
           AND day = ?4
           AND location = ?5
           AND handoff_time > ?6
           AND removed_at IS NULL
           AND claimed_by IS NULL`
      ).bind(cleanName(body.claimedBy), clock.nowIso, cleanId(body.id), clock.day, location, clock.time).run();
      if (Number(result.meta?.changes || 0) !== 1) {
        throw new HttpError(409, "That handoff was already claimed or is no longer available.", "offer_unavailable");
      }
      break;
    }

    case "update_claim": {
      const result = await db.prepare(
        `UPDATE offers
         SET claimed_by = ?1, updated_at = ?2
         WHERE id = ?3
           AND day = ?4
           AND location = ?5
           AND handoff_time > ?6
           AND removed_at IS NULL
           AND claimed_by IS NOT NULL`
      ).bind(cleanName(body.claimedBy), clock.nowIso, cleanId(body.id), clock.day, location, clock.time).run();
      if (Number(result.meta?.changes || 0) !== 1) {
        throw new HttpError(409, "That claimed handoff is no longer available.", "offer_unavailable");
      }
      break;
    }

    case "release_claim": {
      const result = await db.prepare(
        `UPDATE offers
         SET claimed_by = NULL, updated_at = ?1
         WHERE id = ?2
           AND day = ?3
           AND location = ?4
           AND handoff_time > ?5
           AND removed_at IS NULL
           AND claimed_by IS NOT NULL`
      ).bind(clock.nowIso, cleanId(body.id), clock.day, location, clock.time).run();
      if (Number(result.meta?.changes || 0) !== 1) {
        throw new HttpError(409, "That claim is no longer active.", "offer_unavailable");
      }
      break;
    }

    case "remove_offer": {
      const result = await db.prepare(
        `UPDATE offers
         SET removed_at = ?1, updated_at = ?1
         WHERE id = ?2 AND day = ?3 AND location = ?4 AND removed_at IS NULL`
      ).bind(clock.nowIso, cleanId(body.id), clock.day, location).run();
      if (Number(result.meta?.changes || 0) !== 1) {
        throw new HttpError(409, "That offer has already been removed.", "offer_unavailable");
      }
      break;
    }

    default:
      throw new HttpError(400, "That update type is not supported.", "unknown_action");
  }
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const isWrite = request.method !== "GET";
  await applyRateLimits(request, env, isWrite);

  if (request.method === "GET" && url.pathname === "/api/state") {
    const location = cleanLocation(url.searchParams.get("location") || "holyoke");
    return json({ state: await getState(env.DB, location) });
  }

  if (request.method === "POST" && url.pathname === "/api/action") {
    assertSameOrigin(request);
    const body = await readJson(request);
    const location = cleanLocation(body?.location || "holyoke");
    const clock = easternClock();
    await mutate(env.DB, body, clock, location);
    return json({ state: await getState(env.DB, location, clock) });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: API_HEADERS });
  }

  return json({ error: "API route not found.", code: "not_found" }, 404);
}

function normalizeError(error) {
  if (error instanceof HttpError) return error;
  console.error("EV coordinator API error", error);
  const message = String(error?.message || "");
  if (message.includes("no such table")) {
    return new HttpError(503, "The shared database has not been initialized yet.", "database_not_ready");
  }
  return new HttpError(503, "The shared status service is temporarily unavailable.", "service_unavailable");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 404 });
    }
    try {
      return await handleApi(request, env);
    } catch (error) {
      const normalized = normalizeError(error);
      const headers = normalized.status === 429 ? { "Retry-After": "60" } : {};
      return json({ error: normalized.message, code: normalized.code }, normalized.status, headers);
    }
  },

  async scheduled(_controller, env, ctx) {
    const { day } = easternClock();
    ctx.waitUntil(cleanupOldDays(env.DB, day));
  },
};
