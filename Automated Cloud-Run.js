const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const port = Number(process.env.PORT || 8080);
const serviceName = process.env.K_SERVICE || "Automated-Cloud-Run";
const startedAt = new Date();
const runsFile = process.env.RUNS_FILE || path.join(__dirname, "runs.json");
const maxStoredRuns = 50;
const automationRuns = loadRuns();

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

function sendHtml(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function runAutomation(trigger) {
  return recordAutomationRun({
    trigger,
    status: "completed",
    message: "Automation heartbeat recorded.",
  });
}

function loadRuns() {
  try {
    if (!fs.existsSync(runsFile)) {
      return [];
    }

    const data = JSON.parse(fs.readFileSync(runsFile, "utf8"));
    return Array.isArray(data) ? data.slice(0, maxStoredRuns) : [];
  } catch (error) {
    console.warn(`Could not load ${runsFile}: ${error.message}`);
    return [];
  }
}

function saveRuns() {
  try {
    fs.writeFileSync(runsFile, `${JSON.stringify(automationRuns, null, 2)}\n`);
  } catch (error) {
    console.warn(`Could not save ${runsFile}: ${error.message}`);
  }
}

function recordAutomationRun(runDetails) {
  const run = {
    id: crypto.randomUUID(),
    ...runDetails,
    timestamp: new Date().toISOString(),
  };

  automationRuns.unshift(run);
  automationRuns.splice(maxStoredRuns);
  saveRuns();
  console.log(JSON.stringify({ event: "automation.run", ...run }));
  return run;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function checkWebsite(targetUrl, trigger) {
  const started = Date.now();

  try {
    const parsedUrl = new URL(targetUrl);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("URL must start with http:// or https://");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(parsedUrl, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return recordAutomationRun({
      trigger,
      targetUrl: parsedUrl.toString(),
      status: response.ok ? "online" : "error",
      statusCode: response.status,
      responseTimeMs: Date.now() - started,
      message: response.ok ? "Website responded successfully." : "Website returned an error status.",
    });
  } catch (error) {
    return recordAutomationRun({
      trigger,
      targetUrl,
      status: "failed",
      responseTimeMs: Date.now() - started,
      message: error.message,
    });
  }
}

function renderDashboard() {
  const lastRun = automationRuns[0];
  const onlineCount = automationRuns.filter((run) => run.status === "online").length;
  const failedCount = automationRuns.filter((run) => run.status !== "online").length;
  const lastResponseTime = lastRun?.responseTimeMs ? `${lastRun.responseTimeMs} ms` : "None";
  const rows = automationRuns
    .map(
      (run) => `
        <tr class="result-row">
          <td>
            <span class="date">${escapeHtml(run.timestamp)}</span>
          </td>
          <td class="target-cell">${escapeHtml(run.targetUrl || run.trigger)}</td>
          <td><span class="badge ${run.status === "online" ? "badge-online" : "badge-error"}">${escapeHtml(run.status)}</span></td>
          <td>${escapeHtml(run.statusCode || "-")}</td>
          <td>${escapeHtml(run.responseTimeMs ? `${run.responseTimeMs} ms` : "-")}</td>
          <td class="message-cell">${escapeHtml(run.message || "")}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${serviceName}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Arial, Helvetica, sans-serif;
      color: #18202f;
      background: #f4f6f8;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(180deg, #eef3f8 0, #f7f8fb 280px, #f4f6f8 100%);
    }

    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 34px 0 44px;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 22px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .mark {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 8px;
      background: #1769e0;
      color: #ffffff;
      font-weight: 800;
    }

    .eyebrow {
      display: block;
      color: #66728a;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    h1 {
      margin: 0;
      font-size: 30px;
      line-height: 1.1;
    }

    h2 {
      margin: 0;
      font-size: 18px;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      padding: 0 12px;
      background: #ffffff;
      color: #334155;
      font-size: 14px;
      font-weight: 700;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #16a34a;
    }

    .runner {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: end;
      padding: 18px;
      border: 1px solid #d7dee9;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 10px 28px rgba(30, 42, 68, 0.08);
    }

    label {
      display: grid;
      gap: 7px;
      color: #475569;
      font-size: 13px;
      font-weight: 700;
    }

    input {
      min-height: 46px;
      box-sizing: border-box;
      border: 1px solid #b8c2d2;
      border-radius: 6px;
      padding: 0 13px;
      font: inherit;
      color: #162033;
      background: #fbfdff;
    }

    input:focus {
      outline: 3px solid rgba(23, 105, 224, 0.18);
      border-color: #1769e0;
    }

    button {
      min-height: 46px;
      border: 0;
      border-radius: 6px;
      padding: 0 18px;
      background: #1459c8;
      color: #ffffff;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 8px 18px rgba(20, 89, 200, 0.22);
    }

    button:hover {
      background: #0f4fb4;
    }

    button:disabled {
      cursor: wait;
      opacity: 0.7;
    }

    .status {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin: 18px 0;
    }

    .metric {
      border: 1px solid #dce3ee;
      border-radius: 8px;
      padding: 14px;
      background: #ffffff;
    }

    .metric strong {
      display: block;
      margin-top: 6px;
      font-size: 22px;
      line-height: 1.1;
    }

    .label {
      color: #64748b;
      font-size: 13px;
      font-weight: 700;
    }

    .history {
      border: 1px solid #d7dee9;
      border-radius: 8px;
      background: #ffffff;
      overflow: hidden;
    }

    .history-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 18px;
      border-bottom: 1px solid #e1e7f0;
    }

    .history-note {
      color: #64748b;
      font-size: 13px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    th,
    td {
      padding: 12px 14px;
      border-bottom: 1px solid #eef2f7;
      text-align: left;
      vertical-align: top;
    }

    th {
      color: #64748b;
      background: #f8fafc;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .target-cell,
    .message-cell {
      overflow-wrap: anywhere;
    }

    .date {
      color: #475569;
      white-space: nowrap;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border-radius: 999px;
      padding: 0 9px;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .badge-online {
      background: #dcfce7;
      color: #166534;
    }

    .badge-error {
      background: #fee2e2;
      color: #991b1b;
    }

    .empty {
      padding: 18px;
      color: #64748b;
    }

    @media (max-width: 760px) {
      .topbar {
        align-items: flex-start;
        flex-direction: column;
      }

      .runner,
      .status {
        grid-template-columns: 1fr;
      }

      .history {
        overflow-x: auto;
      }

      table {
        min-width: 760px;
      }
    }
  </style>
</head>
<body>
  <main>
    <header class="topbar">
      <div class="brand">
        <div class="mark">CR</div>
        <div>
          <span class="eyebrow">Cloud Run Monitor</span>
          <h1>${escapeHtml(serviceName)}</h1>
        </div>
      </div>
      <span class="status-pill"><span class="dot"></span> Local service online</span>
    </header>

    <section class="runner">
      <label for="targetUrl">
        Website URL
        <input id="targetUrl" type="url" value="https://www.google.com" aria-label="Website URL">
      </label>
        <button id="runButton" type="button">Run check</button>
    </section>

    <section class="status" aria-label="Monitor stats">
      <div class="metric">
        <span class="label">Total checks</span>
        <strong id="runCount">${automationRuns.length}</strong>
      </div>
      <div class="metric">
        <span class="label">Online</span>
        <strong id="onlineCount">${onlineCount}</strong>
      </div>
      <div class="metric">
        <span class="label">Needs attention</span>
        <strong id="failedCount">${failedCount}</strong>
      </div>
      <div class="metric">
        <span class="label">Last response</span>
        <strong id="lastResponse">${escapeHtml(lastResponseTime)}</strong>
      </div>
    </section>

    <section class="history">
      <div class="history-header">
        <h2>Recent Checks</h2>
        <span class="history-note" id="lastRun">${lastRun ? escapeHtml(lastRun.timestamp) : "No checks yet"}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Target</th>
            <th>Status</th>
            <th>Code</th>
            <th>Time</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody id="runs">
          ${rows || '<tr><td colspan="6" class="empty">No checks yet.</td></tr>'}
        </tbody>
      </table>
    </section>
  </main>

  <script>
    const button = document.querySelector("#runButton");
    const targetUrl = document.querySelector("#targetUrl");
    const runCount = document.querySelector("#runCount");
    const onlineCount = document.querySelector("#onlineCount");
    const failedCount = document.querySelector("#failedCount");
    const lastResponse = document.querySelector("#lastResponse");
    const lastRun = document.querySelector("#lastRun");
    const runs = document.querySelector("#runs");

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function renderRows(recentRuns) {
      if (!recentRuns.length) {
        return '<tr><td colspan="6" class="empty">No checks yet.</td></tr>';
      }

      return recentRuns.map((run) => {
        const badgeClass = run.status === "online" ? "badge-online" : "badge-error";
        return \`
          <tr class="result-row">
            <td><span class="date">\${escapeHtml(run.timestamp)}</span></td>
            <td class="target-cell">\${escapeHtml(run.targetUrl || run.trigger)}</td>
            <td><span class="badge \${badgeClass}">\${escapeHtml(run.status)}</span></td>
            <td>\${escapeHtml(run.statusCode || "-")}</td>
            <td>\${escapeHtml(run.responseTimeMs ? run.responseTimeMs + " ms" : "-")}</td>
            <td class="message-cell">\${escapeHtml(run.message || "")}</td>
          </tr>
        \`;
      }).join("");
    }

    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Checking...";

      try {
        const response = await fetch("/run?url=" + encodeURIComponent(targetUrl.value), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trigger: "dashboard", url: targetUrl.value }),
        });
        const data = await response.json();

        runCount.textContent = data.runCount;
        onlineCount.textContent = data.recentRuns.filter((run) => run.status === "online").length;
        failedCount.textContent = data.recentRuns.filter((run) => run.status !== "online").length;
        lastResponse.textContent = data.run.responseTimeMs ? data.run.responseTimeMs + " ms" : "None";
        lastRun.textContent = data.run.timestamp;
        runs.innerHTML = renderRows(data.recentRuns);
      } finally {
        button.disabled = false;
        button.textContent = "Run check";
      }
    });
  </script>
</body>
</html>`;
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/healthz") {
    return sendJson(res, 200, {
      ok: true,
      service: serviceName,
      timestamp: new Date().toISOString(),
    });
  }

  if (url.pathname === "/") {
    return sendHtml(res, 200, renderDashboard());
  }

  if (url.pathname === "/run") {
    if (req.method !== "POST" && req.method !== "GET") {
      return sendJson(res, 405, {
        error: "Method not allowed",
      });
    }

    const targetUrl = url.searchParams.get("url") || "https://www.google.com";
    const run = await checkWebsite(targetUrl, req.method === "POST" ? "dashboard" : "http");
    return sendJson(res, 200, {
      ok: true,
      run,
      runCount: automationRuns.length,
      recentRuns: automationRuns,
    });
  }

  return sendJson(res, 404, {
    error: "Not found",
    path: url.pathname,
  });
}

if (require.main === module) {
  http.createServer(handler).listen(port, "0.0.0.0", () => {
    console.log(`Listening on port ${port}`);
  });
}

module.exports = { handler };
