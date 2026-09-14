(function () {
  "use strict";

  if (window.__GP_DISCORD_ACCESS_STEP3A_V1__) return;
  window.__GP_DISCORD_ACCESS_STEP3A_V1__ = true;

  var VERSION = "step3a-v3";
  var DIALOG_ID = "gp-profile-dialog";
  var TAB_NAME = "discord";
  var API_TIMEOUT_MS = 12000;
  var RESULT_KEYS = [
    "discord_access",
    "discord_link",
    "discord_link_result",
    "discord_result",
    "discord",
    "discord_error",
  ];

  var observer = null;
  var currentStatus = null;
  var currentRequest = 0;
  var actionPending = false;
  var authGeneration = 0;
  var currentSubject = "";
  var resultNotice = consumeResultMarker();
  var resultProfileOpened = false;

  function configuration() {
    return window.GUARDEER_CONFIG || {};
  }

  function resolveApiBase() {
    var config = configuration();
    var raw = String(
      config.DISCORD_ACCESS_API_BASE_URL ||
        config.PRIME_DISCORD_ACCESS_API_BASE_URL ||
        "",
    ).trim();
    if (!raw) return "";
    if (/^(?:replace|paste|changeme|todo)(?:_|\b)/i.test(raw)) return "";
    var isRootRelative = raw.charAt(0) === "/" && raw.charAt(1) !== "/";
    var isAbsolute = /^[a-z][a-z\d+.-]*:\/\//i.test(raw);
    if (!isRootRelative && !isAbsolute) return "";

    try {
      var url = new URL(raw, window.location.origin);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      if (
        url.protocol === "http:" &&
        url.hostname !== "localhost" &&
        url.hostname !== "127.0.0.1" &&
        url.hostname !== "[::1]"
      ) {
        return "";
      }
      return url.toString().replace(/\/+$/, "");
    } catch (_) {
      return "";
    }
  }

  function consumeResultMarker() {
    try {
      var url = new URL(window.location.href);
      var key = "";
      var value = "";

      for (var i = 0; i < RESULT_KEYS.length; i += 1) {
        if (url.searchParams.has(RESULT_KEYS[i])) {
          key = RESULT_KEYS[i];
          value = String(url.searchParams.get(key) || "")
            .trim()
            .toLowerCase();
          break;
        }
      }

      if (!key) return null;
      RESULT_KEYS.forEach(function (candidate) {
        url.searchParams.delete(candidate);
      });
      window.history.replaceState(
        {},
        document.title,
        url.pathname + url.search + url.hash,
      );

      if (/conflict|already[_-]?linked|ownership/.test(value)) {
        return {
          tone: "danger",
          text: "This account could not be linked because an existing Discord ownership link must be resolved first.",
        };
      }
      if (/cancel/.test(value)) {
        return {
          tone: "neutral",
          text: "Discord authorization was cancelled. No account access was changed.",
        };
      }
      if (
        value === "browser_binding_missing" ||
        value === "browser_binding_mismatch"
      ) {
        return {
          tone: "danger",
          text: "Please return to this browser and click Connect Discord again. Avoid completing an older Discord tab.",
        };
      }
      if (value === "state_expired" || value === "state_invalid") {
        return {
          tone: "danger",
          text: "This Discord connection request expired or was already used. Click Connect Discord to start a new request.",
        };
      }
      if (value === "discord_temporary") {
        return {
          tone: "danger",
          text: "Discord is temporarily unavailable. Your account was not changed; please try Connect Discord again shortly.",
        };
      }
      if (key === "discord_error" || /error|fail|denied/.test(value)) {
        return {
          tone: "danger",
          text: "Discord authorization could not be completed. No account access was changed.",
        };
      }
      if (/success|linked|connected|complete/.test(value)) {
        return {
          tone: "success",
          text: "Discord authorization completed. Your premium role synchronization has been queued.",
        };
      }
      return {
        tone: "neutral",
        text: "Discord authorization returned to HUNTER Prime. Check the verified link status below.",
      };
    } catch (_) {
      return null;
    }
  }

  function createError(code, message, status) {
    var error = new Error(message);
    error.code = code;
    error.status = status || 0;
    return error;
  }

  function jwtSubject(token) {
    try {
      var parts = String(token || "").split(".");
      if (parts.length !== 3) return "";
      var encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (encoded.length % 4) encoded += "=";
      var payload = JSON.parse(window.atob(encoded));
      return String((payload && payload.sub) || "").trim();
    } catch (_) {
      return "";
    }
  }

  function bindAuthenticatedSubject(token) {
    var subject = jwtSubject(token);
    if (!subject) {
      throw createError(
        "SIGN_IN_REQUIRED",
        "The authenticated subject is unavailable.",
      );
    }
    if (currentSubject && currentSubject !== subject) {
      authGeneration += 1;
      currentStatus = null;
      actionPending = false;
      resultNotice = null;
    }
    currentSubject = subject;
    return authGeneration;
  }

  async function freshToken() {
    var helper = window.GuardeerAuthKeepAlive;
    if (!helper || typeof helper.ensureFreshSession !== "function") {
      throw createError("AUTH_UNAVAILABLE", "Secure sign-in is not ready.");
    }

    var session = await helper.ensureFreshSession(
      "discord-access-step3a",
      false,
    );
    var token =
      session &&
      (session.id_token ||
        session.IdToken ||
        session.access_token ||
        session.AccessToken);
    if (!token) throw createError("SIGN_IN_REQUIRED", "Please sign in again.");
    bindAuthenticatedSubject(token);
    return token;
  }

  function safeErrorMessage(error, action) {
    var status = Number(error && error.status) || 0;
    if (error && error.code === "API_NOT_CONFIGURED") {
      return "Discord account linking is not configured for this environment.";
    }
    if (
      error &&
      (error.code === "SIGN_IN_REQUIRED" || error.code === "AUTH_UNAVAILABLE")
    ) {
      return "Your secure session is unavailable. Please sign in again before continuing.";
    }
    if (status === 409) {
      return "This Discord account or HUNTER account already has an ownership link. Disconnect the existing link before trying again.";
    }
    if (status === 429) {
      return "Too many Discord access requests were submitted. Please wait before trying again.";
    }
    if (status === 401 || status === 403) {
      return "Your secure session could not authorize this request. Please sign in again.";
    }
    if (status >= 500 || (error && error.code === "NETWORK_ERROR")) {
      return "Discord access synchronization is temporarily unavailable. No premium role was changed.";
    }
    if (action === "connect") {
      return "Discord connection could not be started. No account access was changed.";
    }
    return "The Discord access request could not be completed. No premium role was changed.";
  }

  function unwrapPayload(payload) {
    if (!payload || typeof payload !== "object") return {};
    if (payload.data && typeof payload.data === "object") return payload.data;
    if (payload.status && typeof payload.status === "object")
      return payload.status;
    return payload;
  }

  async function apiRequest(path, method, expectedGeneration) {
    var base = resolveApiBase();
    if (!base) {
      throw createError(
        "API_NOT_CONFIGURED",
        "Discord access API is not configured.",
      );
    }

    var token = await freshToken();
    var requestGeneration = authGeneration;
    if (
      expectedGeneration !== undefined &&
      expectedGeneration !== requestGeneration
    ) {
      throw createError(
        "AUTH_CONTEXT_CHANGED",
        "The signed-in account changed before the request was sent.",
      );
    }
    var controller =
      typeof AbortController === "function" ? new AbortController() : null;
    var timeout = controller
      ? window.setTimeout(function () {
          controller.abort();
        }, API_TIMEOUT_MS)
      : 0;

    try {
      var response = await window.fetch(base + path, {
        method: method,
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
        cache: "no-store",
        credentials: "include",
        signal: controller ? controller.signal : undefined,
      });
      var payload = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) {
        throw createError(
          "API_REQUEST_FAILED",
          "Discord access request failed.",
          response.status,
        );
      }
      return {
        data: unwrapPayload(payload),
        authGeneration: requestGeneration,
      };
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw createError("NETWORK_ERROR", "Discord access request timed out.");
      }
      if (error && error.code) throw error;
      throw createError("NETWORK_ERROR", "Discord access request failed.");
    } finally {
      if (timeout) window.clearTimeout(timeout);
    }
  }

  function validDiscordAuthorizationUrl(value) {
    try {
      var url = new URL(String(value || ""));
      var host = url.hostname.toLowerCase();
      var path = url.pathname.replace(/\/+$/, "");
      var scopes = String(url.searchParams.get("scope") || "")
        .split(/\s+/)
        .filter(Boolean);
      return (
        url.protocol === "https:" &&
        (host === "discord.com" || host === "www.discord.com") &&
        (path === "/oauth2/authorize" || path === "/api/oauth2/authorize") &&
        url.searchParams.get("response_type") === "code" &&
        scopes.length === 1 &&
        scopes[0] === "identify"
      );
    } catch (_) {
      return false;
    }
  }

  function validOfficialInviteUrl(value) {
    try {
      var url = new URL(String(value || ""));
      var host = url.hostname.toLowerCase();
      if (url.protocol !== "https:") return "";
      if (host === "discord.gg" && url.pathname.length > 1)
        return url.toString();
      if (
        (host === "discord.com" || host === "www.discord.com") &&
        /^\/invite\/[^/]+\/?$/i.test(url.pathname)
      ) {
        return url.toString();
      }
      return "";
    } catch (_) {
      return "";
    }
  }

  function normalizedCode(value) {
    return String(value || "")
      .trim()
      .replace(/[\s-]+/g, "_")
      .toUpperCase();
  }

  function displayTier(value) {
    switch (normalizedCode(value)) {
      case "VIP":
        return "PRIME ELITE";
      case "NONE":
        return "No Active Premium Access";
      case "UNKNOWN":
        return "Verification Pending";
      default:
        return "Not Available";
    }
  }

  function displaySyncStatus(status) {
    var value = normalizedCode(
      status && (status.roleSyncStatus || status.linkStatus),
    );
    switch (value) {
      case "SYNCED":
      case "NO_CHANGE":
        return "Synchronized";
      case "SYNC_PENDING":
      case "QUEUED":
        return "Sync Pending";
      case "NOT_IN_GUILD":
        return "Waiting for Server Membership";
      case "RETRY_PENDING":
        return "Retry Pending";
      case "CONFIGURATION_ERROR":
        return "Configuration Review Required";
      case "UNLINK_PENDING":
        return "Disconnect Pending";
      default:
        return status && status.linked
          ? "Pending Verification"
          : "Not Connected";
    }
  }

  function displayDate(value, fallback) {
    if (!value) return fallback;
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function deriveView(status, mode) {
    status = status || {};
    var linked = status.linked === true;
    var linkStatus = normalizedCode(status.linkStatus);
    var syncStatus = normalizedCode(status.roleSyncStatus);
    var tier = normalizedCode(status.currentTier);

    if (mode === "connecting") {
      return {
        title: "Connecting",
        tone: "pending",
        message:
          "Opening the secure Discord authorization page. Only your Discord identity will be requested.",
      };
    }
    if (mode === "loading") {
      return {
        title: "Checking Discord Access",
        tone: "pending",
        message:
          "Verifying your secure account-link and role-synchronization status.",
      };
    }
    if (mode === "unavailable") {
      return {
        title: linked
          ? "Sync Temporarily Unavailable"
          : "Discord Access Temporarily Unavailable",
        tone: "danger",
        message: "Your existing HUNTER subscription remains unchanged.",
      };
    }
    if (mode === "not-configured") {
      return {
        title: "Integration Not Configured",
        tone: "neutral",
        message:
          "Discord account linking is not available in this environment. No request was sent.",
      };
    }
    if (linkStatus === "UNLINK_PENDING" || status.unlinkPending === true) {
      return {
        title: "Disconnect Pending",
        tone: "pending",
        message:
          "Premium Discord role cleanup is still in progress. The account link will remain until cleanup is verified.",
      };
    }
    if (!linked) {
      return {
        title: "Not Connected",
        tone: "neutral",
        message:
          "Connect one Discord account to synchronize premium access from your authoritative HUNTER entitlement.",
      };
    }
    if (linkStatus === "NOT_IN_GUILD") {
      return {
        title: "Linked — Join Discord Server",
        tone: "pending",
        message:
          "Your Discord account is connected, but it is not currently a member of the official HUNTER Discord server.",
      };
    }
    if (
      linkStatus === "RETRY_PENDING" ||
      linkStatus === "CONFIGURATION_ERROR" ||
      /ERROR|FAILED|RETRY|TEMPORAR|UNKNOWN/.test(syncStatus)
    ) {
      return {
        title: "Sync Temporarily Unavailable",
        tone: "danger",
        message:
          "No premium role was changed. Synchronization can be requested again when the service is available.",
      };
    }
    if (linkStatus === "SYNC_PENDING" || /PENDING|QUEUED/.test(syncStatus)) {
      return {
        title: "Linked — Sync Pending",
        tone: "pending",
        message:
          "Your Discord account is verified and secure role synchronization is queued.",
      };
    }
    if (tier === "VIP") {
      return {
        title: "Linked — PRIME ELITE",
        tone: "success",
        message:
          "Your active eligible HUNTER access is synchronized with the PRIME ELITE Discord role.",
      };
    }
    if (tier === "NONE") {
      return {
        title: "Linked — No Active Premium Access",
        tone: "neutral",
        message:
          "Your Discord account is connected, but no active premium entitlement is currently available.",
      };
    }
    return {
      title: "Linked — Sync Pending",
      tone: "pending",
      message:
        "Your Discord account is connected while entitlement verification completes.",
    };
  }

  function panelTemplate() {
    return (
      '<section id="gpDiscordAccessPanel" class="gp-tab-panel gp-discord-access-panel" data-panel="discord" role="tabpanel" aria-labelledby="gpDiscordAccessTab" aria-hidden="true">' +
      '  <div class="gp-discord-heading">' +
      '    <div><span class="gp-discord-kicker">ACCOUNT INTEGRATION</span><h2 id="gpDiscordAccessTitle">Discord PRIME ELITE</h2><p>Securely connect your HUNTER account to one Discord account. Active eligible terminal memberships receive access to the private PRIME ELITE community room.</p></div>' +
      '    <span class="gp-discord-status-badge" data-gp-discord-badge>Checking</span>' +
      "  </div>" +
      '  <div class="gp-discord-result" data-gp-discord-result hidden role="status"></div>' +
      '  <article class="gp-panel-card gp-discord-state-card" aria-live="polite" aria-atomic="true">' +
      '    <div class="gp-discord-state-icon" aria-hidden="true">D</div>' +
      "    <div><h3 data-gp-discord-state-title>Checking Discord Access</h3><p data-gp-discord-state-message>Verifying your secure account-link and role-synchronization status.</p></div>" +
      "  </article>" +
      '  <div class="gp-discord-info-grid">' +
      '    <article class="gp-panel-card"><h3>Discord Account</h3><div class="gp-info-list">' +
      "      <div><span>Display name</span><strong data-gp-discord-display-name>Not connected</strong></div>" +
      "      <div><span>Username</span><strong data-gp-discord-username>Not connected</strong></div>" +
      "      <div><span>Discord ID</span><strong data-gp-discord-id>Not connected</strong></div>" +
      "    </div></article>" +
      '    <article class="gp-panel-card"><h3>PRIME ELITE Access</h3><div class="gp-info-list">' +
      "      <div><span>Discord role</span><strong data-gp-discord-tier>Not available</strong></div>" +
      "      <div><span>Role sync</span><strong data-gp-discord-sync>Not connected</strong></div>" +
      "      <div><span>Last synchronization</span><strong data-gp-discord-last-sync>Not yet synchronized</strong></div>" +
      "      <div data-gp-discord-expiry-row hidden><span>Subscription expires</span><strong data-gp-discord-expiry>Not available</strong></div>" +
      "    </div></article>" +
      "  </div>" +
      '  <article class="gp-panel-card gp-discord-actions-card">' +
      '    <div><h3>Account Actions</h3><p class="gp-profile-note">There is no manual role selection. PRIME ELITE access follows the verified status of your active HUNTER terminal membership.</p></div>' +
      '    <div class="gp-discord-actions">' +
      '      <button class="gp-main-action gp-discord-connect" type="button" data-gp-discord-action="connect" hidden>Connect Discord</button>' +
      '      <a class="gp-main-action gp-discord-join" data-gp-discord-action="join" target="_blank" rel="noopener noreferrer" hidden>Join Official Discord</a>' +
      '      <button class="gp-soft-action" type="button" data-gp-discord-action="sync" hidden>Sync Discord Access</button>' +
      '      <button class="gp-soft-action gp-discord-disconnect" type="button" data-gp-discord-action="disconnect" hidden>Disconnect Discord</button>' +
      "    </div>" +
      "  </article>" +
      '  <aside class="gp-discord-security-notice">' +
      '    <span aria-hidden="true">✓</span><div><strong>Security Notice</strong><p>HUNTER will never ask for your Discord password, HUNTER password, OTP code, private key, seed phrase, or direct payment through a Discord message.</p></div>' +
      "  </aside>" +
      "</section>"
    );
  }

  function setText(panel, selector, value) {
    var element = panel.querySelector(selector);
    if (element) element.textContent = value;
  }

  function setHidden(panel, selector, hidden) {
    var element = panel.querySelector(selector);
    if (element) element.hidden = Boolean(hidden);
  }

  function renderResultNotice(panel) {
    var element = panel.querySelector("[data-gp-discord-result]");
    if (!element) return;
    if (!resultNotice) {
      element.hidden = true;
      element.textContent = "";
      element.removeAttribute("data-tone");
      return;
    }
    element.hidden = false;
    element.dataset.tone = resultNotice.tone;
    element.textContent = resultNotice.text;
  }

  function renderPanel(panel, status, mode, errorMessage) {
    if (!panel || !panel.isConnected) return;
    status = status || {};
    var view = deriveView(status, mode);
    var linked = status.linked === true;
    var unlinkPending =
      status.unlinkPending === true ||
      normalizedCode(status.linkStatus) === "UNLINK_PENDING";
    var notInGuild = normalizedCode(status.linkStatus) === "NOT_IN_GUILD";
    var inviteUrl = notInGuild
      ? validOfficialInviteUrl(status.officialInviteUrl)
      : "";

    panel.dataset.gpDiscordTone = view.tone;
    setText(panel, "[data-gp-discord-badge]", view.title);
    setText(panel, "[data-gp-discord-state-title]", view.title);
    setText(
      panel,
      "[data-gp-discord-state-message]",
      errorMessage || view.message,
    );

    setText(
      panel,
      "[data-gp-discord-display-name]",
      linked
        ? String(
            status.discordGlobalName ||
              status.discordUsername ||
              "Connected account",
          )
        : "Not connected",
    );
    setText(
      panel,
      "[data-gp-discord-username]",
      linked && status.discordUsername
        ? "@" + String(status.discordUsername).replace(/^@/, "")
        : "Not connected",
    );
    setText(
      panel,
      "[data-gp-discord-id]",
      linked && status.maskedDiscordId
        ? String(status.maskedDiscordId)
        : "Not connected",
    );
    setText(
      panel,
      "[data-gp-discord-tier]",
      linked ? displayTier(status.currentTier) : "Not available",
    );
    setText(panel, "[data-gp-discord-sync]", displaySyncStatus(status));
    setText(
      panel,
      "[data-gp-discord-last-sync]",
      displayDate(status.lastSyncAt, "Not yet synchronized"),
    );

    var hasExpiry = linked && Boolean(status.entitlementExpiresAt);
    setHidden(panel, "[data-gp-discord-expiry-row]", !hasExpiry);
    if (hasExpiry) {
      setText(
        panel,
        "[data-gp-discord-expiry]",
        displayDate(status.entitlementExpiresAt, "Backend managed"),
      );
    }

    var configured = Boolean(resolveApiBase());
    var connect = panel.querySelector('[data-gp-discord-action="connect"]');
    var join = panel.querySelector('[data-gp-discord-action="join"]');
    var sync = panel.querySelector('[data-gp-discord-action="sync"]');
    var disconnect = panel.querySelector(
      '[data-gp-discord-action="disconnect"]',
    );

    if (connect) connect.hidden = !configured || linked || mode === "loading";
    if (join) {
      join.hidden = !linked || !notInGuild || !inviteUrl || unlinkPending;
      if (inviteUrl) join.href = inviteUrl;
      else join.removeAttribute("href");
    }
    if (sync)
      sync.hidden =
        !configured || !linked || unlinkPending || mode === "loading";
    if (disconnect)
      disconnect.hidden =
        !configured || !linked || unlinkPending || mode === "loading";

    [connect, sync, disconnect].forEach(function (button) {
      if (button) button.disabled = actionPending;
    });
    if (join) {
      join.setAttribute("aria-disabled", actionPending ? "true" : "false");
      join.tabIndex = actionPending ? -1 : 0;
    }

    renderResultNotice(panel);
  }

  function activateDiscordPanel(dialog) {
    var button = dialog.querySelector("[data-gp-discord-tab]");
    var panel = dialog.querySelector(".gp-discord-access-panel");
    if (!button || !panel) return;
    dialog.querySelectorAll(".gp-side-link").forEach(function (item) {
      item.classList.toggle("active", item === button);
      if (item === button) item.setAttribute("aria-selected", "true");
    });
    dialog.querySelectorAll(".gp-tab-panel").forEach(function (item) {
      item.classList.toggle("active", item === panel);
    });
    panel.setAttribute("aria-hidden", "false");
    dialog
      .querySelectorAll("[data-gp-discord-mobile-tab]")
      .forEach(function (item) {
        item.classList.toggle(
          "is-active",
          item.dataset.gpDiscordMobileTab === TAB_NAME,
        );
        item.setAttribute(
          "aria-selected",
          item.dataset.gpDiscordMobileTab === TAB_NAME ? "true" : "false",
        );
      });
    panel.setAttribute("tabindex", "-1");
    panel.focus({ preventScroll: true });
  }

  function activateAccountPanel(dialog) {
    var dashboardButton = dialog.querySelector(
      '.gp-side-link[data-tab="dashboard"]',
    );
    if (dashboardButton) dashboardButton.click();
    var discordButton = dialog.querySelector("[data-gp-discord-tab]");
    var discordPanel = dialog.querySelector(".gp-discord-access-panel");
    if (discordButton) discordButton.setAttribute("aria-selected", "false");
    if (discordPanel) discordPanel.setAttribute("aria-hidden", "true");
    dialog
      .querySelectorAll("[data-gp-discord-mobile-tab]")
      .forEach(function (item) {
        item.classList.toggle(
          "is-active",
          item.dataset.gpDiscordMobileTab === "account",
        );
        item.setAttribute(
          "aria-selected",
          item.dataset.gpDiscordMobileTab === "account" ? "true" : "false",
        );
      });
  }

  async function loadStatus(panel) {
    var requestId = ++currentRequest;
    var generation = authGeneration;
    if (!resolveApiBase()) {
      currentStatus = null;
      renderPanel(panel, {}, "not-configured");
      return;
    }

    renderPanel(panel, {}, "loading");
    try {
      var response = await apiRequest("/discord/link/status", "GET");
      if (requestId !== currentRequest) return;
      if (response.authGeneration !== authGeneration) return;
      currentStatus = response.data;
      renderPanel(panel, currentStatus);
    } catch (error) {
      if (requestId !== currentRequest) return;
      if (generation !== authGeneration) {
        loadStatus(panel);
        return;
      }
      renderPanel(panel, {}, "unavailable", safeErrorMessage(error, "status"));
    }
  }

  async function connectDiscord(panel) {
    if (actionPending) return;
    var generation = authGeneration;
    actionPending = true;
    renderPanel(panel, currentStatus || {}, "connecting");
    try {
      var response = await apiRequest(
        "/discord/link/start",
        "POST",
        generation,
      );
      if (generation !== authGeneration) return;
      var result = response.data;
      if (!validDiscordAuthorizationUrl(result.authorizationUrl)) {
        throw createError(
          "INVALID_AUTHORIZATION_URL",
          "Invalid Discord authorization URL.",
        );
      }
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      if (generation !== authGeneration) return;
      actionPending = false;
      renderPanel(
        panel,
        currentStatus || {},
        "unavailable",
        safeErrorMessage(error, "connect"),
      );
    }
  }

  async function syncDiscord(panel) {
    if (actionPending) return;
    var generation = authGeneration;
    actionPending = true;
    renderPanel(
      panel,
      Object.assign({}, currentStatus || {}, {
        linked: true,
        linkStatus: "SYNC_PENDING",
        roleSyncStatus: "QUEUED",
      }),
    );
    try {
      var response = await apiRequest("/discord/link/sync", "POST", generation);
      if (generation !== authGeneration) return;
      var result = response.data;
      currentStatus =
        result && typeof result.linked === "boolean"
          ? result
          : Object.assign({}, currentStatus || {}, {
              linked: true,
              linkStatus: "SYNC_PENDING",
              roleSyncStatus: "QUEUED",
            });
      resultNotice = {
        tone: "success",
        text: "Discord access synchronization was queued securely.",
      };
      actionPending = false;
      renderPanel(panel, currentStatus);
    } catch (error) {
      if (generation !== authGeneration) return;
      actionPending = false;
      renderPanel(
        panel,
        currentStatus || {},
        "unavailable",
        safeErrorMessage(error, "sync"),
      );
    }
  }

  async function disconnectDiscord(panel) {
    if (actionPending) return;
    var confirmed = window.confirm(
      "Disconnecting Discord will remove HUNTER premium Discord access. Your HUNTER subscription will not be cancelled.",
    );
    if (!confirmed) return;

    var generation = authGeneration;
    actionPending = true;
    renderPanel(
      panel,
      Object.assign({}, currentStatus || {}, {
        linked: true,
        linkStatus: "UNLINK_PENDING",
        unlinkPending: true,
      }),
    );
    try {
      var response = await apiRequest("/discord/link", "DELETE", generation);
      if (generation !== authGeneration) return;
      var result = response.data;
      currentStatus =
        result && typeof result.linked === "boolean"
          ? result
          : Object.assign({}, currentStatus || {}, {
              linked: true,
              linkStatus: "UNLINK_PENDING",
              unlinkPending: true,
              roleSyncStatus: "UNLINK_PENDING",
            });
      resultNotice = {
        tone: "neutral",
        text: "Disconnect requested. The account link will remain until premium role cleanup is verified.",
      };
      actionPending = false;
      renderPanel(panel, currentStatus);
    } catch (error) {
      if (generation !== authGeneration) return;
      actionPending = false;
      renderPanel(
        panel,
        currentStatus || {},
        "unavailable",
        safeErrorMessage(error, "disconnect"),
      );
    }
  }

  function bindPanelActions(panel) {
    panel
      .querySelector('[data-gp-discord-action="connect"]')
      ?.addEventListener("click", function () {
        connectDiscord(panel);
      });
    panel
      .querySelector('[data-gp-discord-action="sync"]')
      ?.addEventListener("click", function () {
        syncDiscord(panel);
      });
    panel
      .querySelector('[data-gp-discord-action="disconnect"]')
      ?.addEventListener("click", function () {
        disconnectDiscord(panel);
      });
    panel
      .querySelector('[data-gp-discord-action="join"]')
      ?.addEventListener("click", function (event) {
        if (actionPending || !validOfficialInviteUrl(event.currentTarget.href))
          event.preventDefault();
      });
  }

  function injectProfile(dialog) {
    if (
      !dialog ||
      dialog.id !== DIALOG_ID ||
      dialog.dataset.gpDiscordAccessInjected === "true"
    )
      return;
    var sidebar = dialog.querySelector(".gp-profile-sidebar");
    var content = dialog.querySelector(".gp-profile-content");
    if (!sidebar || !content) return;

    dialog.dataset.gpDiscordAccessInjected = "true";
    var button = document.createElement("button");
    button.type = "button";
    button.className = "gp-side-link gp-discord-side-link";
    button.id = "gpDiscordAccessTab";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "gpDiscordAccessPanel");
    button.setAttribute("aria-selected", "false");
    button.dataset.tab = TAB_NAME;
    button.dataset.gpDiscordTab = "true";
    button.textContent = "Discord Access";

    var settingsButton = sidebar.querySelector('[data-tab="settings"]');
    sidebar.insertBefore(
      button,
      settingsButton || sidebar.querySelector(".gp-plan-mini"),
    );

    var mobileNav = document.createElement("nav");
    mobileNav.className = "gp-discord-mobile-nav";
    mobileNav.setAttribute("aria-label", "Profile sections");
    mobileNav.setAttribute("role", "tablist");
    mobileNav.innerHTML =
      '<button class="is-active" type="button" role="tab" aria-selected="true" data-gp-discord-mobile-tab="account">Account Overview</button>' +
      '<button type="button" role="tab" aria-controls="gpDiscordAccessPanel" aria-selected="false" data-gp-discord-mobile-tab="discord">Discord Access</button>';
    content.prepend(mobileNav);

    var wrapper = document.createElement("div");
    wrapper.innerHTML = panelTemplate();
    var panel = wrapper.firstElementChild;
    var avatarInput = content.querySelector("#gpAvatarInput");
    content.insertBefore(panel, avatarInput || null);

    button.addEventListener("click", function () {
      activateDiscordPanel(dialog);
      loadStatus(panel);
    });
    sidebar.querySelectorAll(".gp-side-link").forEach(function (item) {
      if (item === button) return;
      item.addEventListener("click", function () {
        button.setAttribute("aria-selected", "false");
        panel.setAttribute("aria-hidden", "true");
      });
    });
    mobileNav
      .querySelector('[data-gp-discord-mobile-tab="account"]')
      ?.addEventListener("click", function () {
        activateAccountPanel(dialog);
      });
    mobileNav
      .querySelector('[data-gp-discord-mobile-tab="discord"]')
      ?.addEventListener("click", function () {
        activateDiscordPanel(dialog);
        loadStatus(panel);
      });
    bindPanelActions(panel);
    renderPanel(
      panel,
      currentStatus || {},
      resolveApiBase() ? "loading" : "not-configured",
    );

    if (resultNotice) {
      activateDiscordPanel(dialog);
      loadStatus(panel);
    } else {
      loadStatus(panel);
    }
  }

  function maybeOpenResultProfile() {
    if (!resultNotice || resultProfileOpened) return;
    var dialog = document.getElementById(DIALOG_ID);
    if (dialog) {
      resultProfileOpened = true;
      injectProfile(dialog);
      activateDiscordPanel(dialog);
      return;
    }
    if (!document.body.classList.contains("gp-user-signed-in")) return;
    var launcher =
      document.querySelector('[data-gp-auth="profile-open"]') ||
      document.querySelector('[data-gp-auth="profile"]');
    if (launcher) {
      resultProfileOpened = true;
      launcher.click();
    }
  }

  function inspectAddedNode(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.id === DIALOG_ID) injectProfile(node);
    if (node.id === "gp-auth-widget" && resultNotice) {
      window.setTimeout(maybeOpenResultProfile, 0);
    }
  }

  function boot() {
    if (!document.body) return;
    var existing = document.getElementById(DIALOG_ID);
    if (existing) injectProfile(existing);

    observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(inspectAddedNode);
      });
    });
    observer.observe(document.body, { childList: true });

    window.addEventListener("guardeer:auth-updated", function (event) {
      var detail = (event && event.detail) || {};
      authGeneration += 1;
      currentSubject = "";
      currentStatus = null;
      currentRequest += 1;
      actionPending = false;
      if (detail.signedIn === false) resultNotice = null;
      var panel = document.querySelector(
        "#" + DIALOG_ID + " .gp-discord-access-panel",
      );
      if (panel && detail.signedIn !== false) loadStatus(panel);
      window.setTimeout(maybeOpenResultProfile, 0);
    });

    window.setTimeout(maybeOpenResultProfile, 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  window.GuardeerDiscordAccessStep3A = {
    version: VERSION,
    refresh: function () {
      var panel = document.querySelector(
        "#" + DIALOG_ID + " .gp-discord-access-panel",
      );
      if (panel) loadStatus(panel);
    },
  };
})();
