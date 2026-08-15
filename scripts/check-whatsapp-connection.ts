/**
 * Sprint 1 §10 — the connection layer, with OpenWA stubbed.
 *
 *   npm run check:whatsapp:connection
 *
 * Every case the sprint lists: missing configuration, invalid API key, OpenWA
 * unreachable, session not found, session disconnected, successful connection,
 * and the provider abstraction itself.
 *
 * `fetch` is replaced per case, so this exercises the real client, the real
 * provider and the real health service against a stubbed gateway. No database
 * is needed: the health service treats recording its result as bookkeeping and
 * reports the status it observed even when the write fails.
 */
import assert from "node:assert/strict";

// Configuration has to exist before the modules that read it are imported.
const ENV = {
  OPENWA_ENABLED: "true",
  OPENWA_BASE_URL: "https://openwa.test",
  OPENWA_API_KEY: "owa_k1_test",
  OPENWA_SESSION_ID: "11111111-2222-3333-4444-555555555555",
  OPENWA_WEBHOOK_URL: "https://living.test/api/integrations/openwa/webhook",
  OPENWA_WEBHOOK_SECRET: "s".repeat(64),
  OPENWA_TIMEOUT_MS: "500",
  OPENWA_MAX_RETRIES: "2",
};
for (const [key, value] of Object.entries(ENV)) process.env[key] = value;

let checks = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    checks += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
};

const realFetch = globalThis.fetch;

/** Answers every request with one canned response, and records what was asked. */
function stubFetch(
  handler: (url: string, init: RequestInit) => { status: number; body: unknown },
) {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    seen.push({
      url,
      headers: Object.fromEntries(
        Object.entries((init.headers ?? {}) as Record<string, string>),
      ),
    });
    const { status, body } = handler(url, init);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return seen;
}

const restore = () => {
  globalThis.fetch = realFetch;
};

async function main() {
  // Imported here, not at the top: the modules read process.env when they load,
  // and tsx compiles this to CJS where top-level await is unavailable.
  const { OpenWAProvider } = await import("../lib/integrations/whatsapp/openwa/provider");
  const { OpenWAError, openWA } = await import("../lib/integrations/whatsapp/openwa/client");
  const { isWhatsAppEnabled, whatsappConfigProblems, openWAConfig } = await import(
    "../lib/integrations/whatsapp/config"
  );
  const { WhatsAppIntegrationHealthService, describeHealth } = await import(
    "../lib/integrations/whatsapp/health"
  );
  const { WhatsAppService } = await import("../lib/integrations/whatsapp/service");

  // --- configuration --------------------------------------------------------
  await check("missing configuration disables rather than crashes", () => {
    const saved = process.env.OPENWA_API_KEY;
    delete process.env.OPENWA_API_KEY;

    assert.equal(isWhatsAppEnabled(), false, "must report itself off");
    assert.ok(
      whatsappConfigProblems().some((p) => p.includes("OPENWA_API_KEY")),
      "must name the missing variable",
    );
    // Reading the config in that state throws rather than half-building a
    // client that would send requests with no key.
    assert.throws(() => openWAConfig(), /not configured/i);

    process.env.OPENWA_API_KEY = saved;
    assert.equal(isWhatsAppEnabled(), true);
  });

  await check("a short webhook secret is reported, not accepted quietly", () => {
    const saved = process.env.OPENWA_WEBHOOK_SECRET;
    process.env.OPENWA_WEBHOOK_SECRET = "tooshort";
    assert.ok(whatsappConfigProblems().some((p) => p.includes("32 characters")));
    process.env.OPENWA_WEBHOOK_SECRET = saved;
  });

  // --- the client's contract with OpenWA ------------------------------------
  await check("every request carries X-API-Key and never the key in the URL", async () => {
    const seen = stubFetch(() => ({ status: 200, body: { id: "s1", status: "connected" } }));
    try {
      await openWA.getSession();
      assert.equal(seen.length, 1);
      assert.equal(seen[0].headers["X-API-Key"], ENV.OPENWA_API_KEY);
      assert.ok(
        !seen[0].url.includes(ENV.OPENWA_API_KEY),
        "the key must not end up in an access log",
      );
      assert.ok(seen[0].url.startsWith(`${ENV.OPENWA_BASE_URL}/api/sessions/`));
    } finally {
      restore();
    }
  });

  await check("an invalid API key is a permanent failure, not retried", async () => {
    const seen = stubFetch(() => ({
      status: 401,
      body: { statusCode: 401, message: "Invalid API key", error: "Unauthorized" },
    }));
    try {
      await assert.rejects(
        () => openWA.getSession(),
        (error: unknown) => {
          assert.ok(error instanceof OpenWAError);
          assert.equal((error as InstanceType<typeof OpenWAError>).status, 401);
          assert.equal((error as InstanceType<typeof OpenWAError>).retryable, false);
          // The message is shown to an admin; it must carry the reason and
          // never the key.
          assert.match((error as Error).message, /Invalid API key/);
          assert.ok(!(error as Error).message.includes(ENV.OPENWA_API_KEY));
          return true;
        },
      );
      assert.equal(seen.length, 1, "a rejected key must not be retried");
    } finally {
      restore();
    }
  });

  await check("an unreachable OpenWA is retried, then reported", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    try {
      await assert.rejects(() => openWA.getSession(), OpenWAError);
      // GET is idempotent, so it is retried up to OPENWA_MAX_RETRIES.
      assert.equal(calls, Number(ENV.OPENWA_MAX_RETRIES));
    } finally {
      restore();
    }
  });

  await check("a send is never retried — a duplicate message is worse", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    try {
      await assert.rejects(() => openWA.sendText("919876543210@c.us", "hi"), OpenWAError);
      assert.equal(calls, 1);
    } finally {
      restore();
    }
  });

  await check("a 5xx is retryable, a 4xx is not", async () => {
    for (const [status, retryable] of [
      [500, true],
      [503, true],
      [429, true],
      [400, false],
      [404, false],
    ] as const) {
      stubFetch(() => ({ status, body: { message: "x" } }));
      try {
        await openWA.getSession();
        assert.fail(`${status} should have thrown`);
      } catch (error) {
        assert.ok(error instanceof OpenWAError);
        assert.equal(
          (error as InstanceType<typeof OpenWAError>).retryable,
          retryable,
          `${status} classified wrongly`,
        );
      } finally {
        restore();
      }
    }
  });

  // --- the provider abstraction --------------------------------------------
  await check("the provider satisfies the interface and normalises responses", async () => {
    const provider = new OpenWAProvider();
    assert.equal(provider.name, "openwa");
    for (const method of [
      "sendText",
      "sendMedia",
      "getSessionStatus",
      "configureWebhook",
      "listWebhooks",
      "parseWebhook",
    ]) {
      assert.equal(
        typeof (provider as unknown as Record<string, unknown>)[method],
        "function",
        `${method} missing from the provider`,
      );
    }

    // OpenWA's own field names must not survive the boundary.
    stubFetch(() => ({
      status: 200,
      body: {
        id: ENV.OPENWA_SESSION_ID,
        name: "Living CRM",
        status: "WORKING",
        connected: true,
        me: { id: "919876543210@c.us", pushname: "Living" },
      },
    }));
    try {
      const info = await provider.getSessionStatus();
      assert.deepEqual(Object.keys(info).sort(), [
        "displayName",
        "phoneNumber",
        "providerSessionId",
        "status",
      ]);
      assert.equal(info.status, "connected");
      assert.equal(info.phoneNumber, "919876543210");
      assert.equal(info.displayName, "Living CRM");
    } finally {
      restore();
    }
  });

  await check("a send failure comes back typed, never thrown", async () => {
    const provider = new OpenWAProvider();
    stubFetch(() => ({ status: 500, body: { message: "boom" } }));
    try {
      const result = await provider.sendText({ to: "919876543210", text: "hi" });
      // §50: the CRM write has already committed by the time this runs, so a
      // throw here would roll back something that succeeded.
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.retryable, true);
    } finally {
      restore();
    }
  });

  await check("webhook configuration is idempotent", async () => {
    const provider = new OpenWAProvider();
    let posts = 0;
    stubFetch((url, init) => {
      if (init.method === "POST") {
        posts += 1;
        return { status: 201, body: { id: "new", url: ENV.OPENWA_WEBHOOK_URL } };
      }
      return {
        status: 200,
        body: [{ id: "existing", url: ENV.OPENWA_WEBHOOK_URL, events: ["message.received"] }],
      };
    });
    try {
      const registration = await provider.configureWebhook(
        ENV.OPENWA_WEBHOOK_URL,
        ["message.received"],
        ENV.OPENWA_WEBHOOK_SECRET,
      );
      assert.equal(registration.id, "existing");
      // §42: a redeploy must not add a second hook and double every message.
      assert.equal(posts, 0);
    } finally {
      restore();
    }
  });

  // --- normalised session states -------------------------------------------
  await check("every OpenWA state maps onto a Living one", async () => {
    const provider = new OpenWAProvider();
    const cases: [Record<string, unknown>, string][] = [
      [{ connected: true }, "connected"],
      [{ status: "WORKING" }, "connected"],
      [{ status: "authenticated" }, "connected"],
      [{ status: "SCAN_QR_CODE" }, "connecting"],
      [{ status: "starting" }, "connecting"],
      [{ status: "STOPPED" }, "disconnected"],
      [{ status: "logged_out" }, "disconnected"],
      [{ status: "something-new" }, "unknown"],
      [{}, "unknown"],
    ];
    for (const [body, expected] of cases) {
      stubFetch(() => ({ status: 200, body: { id: "s1", ...body } }));
      try {
        const info = await provider.getSessionStatus();
        assert.equal(info.status, expected, `${JSON.stringify(body)} → ${info.status}`);
      } finally {
        restore();
      }
    }
  });

  // --- §7: the health service tells the four failures apart ----------------
  await check("a successful connection reports connected", async () => {
    stubFetch(() => ({
      status: 200,
      body: { id: ENV.OPENWA_SESSION_ID, connected: true, me: { id: "919876543210@c.us" } },
    }));
    try {
      const health = await WhatsAppIntegrationHealthService.check();
      assert.equal(health.status, "connected");
      assert.equal(health.configured, true);
      assert.equal(health.reachable, true);
      assert.equal(health.apiKeyValid, true);
      assert.equal(health.sessionFound, true);
      assert.equal(health.error, null);
    } finally {
      restore();
    }
  });

  await check("a disconnected session is reported as disconnected, not error", async () => {
    // The gateway is fine; the WhatsApp connection is not. Collapsing these
    // into one status sends someone to debug the wrong thing.
    stubFetch(() => ({ status: 200, body: { id: ENV.OPENWA_SESSION_ID, status: "STOPPED" } }));
    try {
      const health = await WhatsAppIntegrationHealthService.check();
      assert.equal(health.status, "disconnected");
      assert.equal(health.reachable, true);
      assert.equal(health.apiKeyValid, true);
      assert.equal(health.sessionFound, true);
    } finally {
      restore();
    }
  });

  await check("an invalid API key is reported as an invalid API key", async () => {
    stubFetch(() => ({ status: 401, body: { message: "Invalid API key" } }));
    try {
      const health = await WhatsAppIntegrationHealthService.check();
      assert.equal(health.status, "error");
      assert.equal(health.reachable, true);
      assert.equal(health.apiKeyValid, false);
      assert.ok(describeHealth(health).some((line) => /rejected/i.test(line)));
    } finally {
      restore();
    }
  });

  await check("a missing session is reported as a missing session", async () => {
    stubFetch(() => ({ status: 404, body: { message: "Session not found" } }));
    try {
      const health = await WhatsAppIntegrationHealthService.check();
      assert.equal(health.status, "error");
      assert.equal(health.reachable, true);
      assert.equal(health.apiKeyValid, true, "the key was accepted; the session was not there");
      assert.equal(health.sessionFound, false);
      assert.ok(describeHealth(health).some((line) => /not found/i.test(line)));
    } finally {
      restore();
    }
  });

  await check("an unreachable gateway is reported as unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    try {
      const health = await WhatsAppIntegrationHealthService.check();
      assert.equal(health.status, "error");
      assert.equal(health.reachable, false);
      assert.ok(describeHealth(health).some((line) => /could not be reached/i.test(line)));
    } finally {
      restore();
    }
  });

  await check("an unconfigured integration is unknown, never error", async () => {
    const saved = process.env.OPENWA_ENABLED;
    process.env.OPENWA_ENABLED = "false";
    try {
      const health = await WhatsAppIntegrationHealthService.check();
      // Off is not broken. This app runs deliberately without WhatsApp.
      assert.equal(health.status, "unknown");
      assert.equal(health.configured, false);
      assert.ok(describeHealth(health)[0].includes("not configured"));
    } finally {
      process.env.OPENWA_ENABLED = saved;
    }
  });

  await check("the health check never throws, whatever comes back", async () => {
    for (const body of ["<html>gateway error</html>", "", "null", "[]"]) {
      stubFetch(() => ({ status: 502, body }));
      try {
        const health = await WhatsAppIntegrationHealthService.check();
        assert.equal(health.status, "error");
      } finally {
        restore();
      }
    }
  });

  // --- §3: the named service CRM code is meant to call ---------------------
  await check("WhatsAppService exposes the seam and hides the provider", () => {
    for (const key of [
      "provider",
      "isEnabled",
      "sendText",
      "retryFailedOutbound",
      "currentSession",
      "recentMessages",
      "getSessionStatus",
    ]) {
      assert.ok(key in WhatsAppService, `WhatsAppService.${key} missing`);
    }
    assert.equal(WhatsAppService.provider().name, "openwa");
    assert.equal(WhatsAppService.isEnabled(), true);
  });

  await check("no CRM module imports OpenWA directly", async () => {
    // §3/§59: the whole point of the abstraction. If this fails, replacing
    // OpenWA later means touching lead and property code.
    const { readdir, readFile } = await import("node:fs/promises");
    const roots = ["lib/crm", "app/admin", "app/api"];
    const offenders: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          await walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          const source = await readFile(full, "utf8");
          if (/from "@\/lib\/integrations\/whatsapp\/openwa/.test(source)) {
            offenders.push(full);
          }
        }
      }
    };

    for (const root of roots) await walk(root);
    assert.deepEqual(offenders, [], `these import OpenWA directly: ${offenders.join(", ")}`);
  });

  console.log(`\n${checks} checks passed`);
  if (process.exitCode) console.error("Some checks failed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
