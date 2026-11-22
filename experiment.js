/* Public experiment configuration. Responder links only; never put secrets here. */
(() => {
  "use strict";

  const config = Object.freeze({
    enabled: false,
    endpoint: "",
    terminalForm: "",
    businessForm: "",
    generalForm: "",
  });

  const experiment = "meeting-lab-v1";
  const armKey = experiment + ":arm";
  const sessionKey = experiment + ":session";
  const stateKey = "meetingLabVariant";
  const armNames = ["terminal", "business"];
  const eventNames = ["impression", "attention", "waitlist_click", "variant_switch"];
  const endpointURL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
  const formURL = /^https:\/\/(?:docs\.google\.com\/forms\/d\/(?:e\/)?[A-Za-z0-9_-]+\/viewform|forms\.gle\/[A-Za-z0-9]+)$/;
  const liveExperiment = config.enabled && endpointURL.test(config.endpoint) && formURL.test(config.terminalForm) &&
    formURL.test(config.businessForm) && config.terminalForm !== config.businessForm;
  const campaignKeys = new Set(["ref", "utm_source", "utm_medium", "utm_campaign", "utm_term",
    "utm_content", "utm_id", "utm_source_platform", "utm_creative_format", "utm_marketing_tactic"]);

  const generalForm = formURL.test(config.generalForm) &&
    ![config.terminalForm, config.businessForm].includes(config.generalForm) ? config.generalForm : "";
  const isBusiness = location.pathname.endsWith("/business.html");
  const view = isBusiness ? "business" : "terminal";
  let arm = view;
  let continued = false;
  const declined = () => navigator.globalPrivacyControl === true ||
    [navigator.doNotTrack, window.doNotTrack].some(value => value === "1" || value === "yes");
  const markup = document.querySelector("[data-waitlist]");
  let enrolled = false;

  function showWaitlist(url) {
    if (!markup || !url) return;
    const link = document.createElement("a");
    link.href = url;
    link.rel = "noreferrer";
    link.referrerPolicy = "no-referrer";
    link.className = isBusiness ? "button primary" : "launch";
    link.textContent = "Join the waitlist";
    markup.replaceChildren(link);
    if (enrolled) link.addEventListener("click", event => {
      if (event.isTrusted && !event.defaultPrevented) sendOnce("waitlist_click");
    });
  }

  function readSession() {
    const value = JSON.parse(sessionStorage.getItem(sessionKey) || "{}");
    return value && typeof value === "object" ? value : {};
  }
  function writeSession(value) {
    sessionStorage.setItem(sessionKey, JSON.stringify(value));
  }

  if (liveExperiment && !declined() && window.crypto && window.fetch) {
    try {
      const url = new URL(location.href);
      const campaignOnly = [...url.searchParams.keys()].every(key => campaignKeys.has(key));
      const rootEntry = url.pathname.endsWith("/") && campaignOnly && !url.hash;
      const historyArm = history.state && history.state[stateKey];
      const historySwitch = history.state && history.state.meetingLabSwitch === true;
      let selected = localStorage.getItem(armKey);

      if (rootEntry && !armNames.includes(selected)) {
        // One unbiased random bit, persisted as an arm, never as a visitor ID.
        selected = armNames[crypto.getRandomValues(new Uint8Array(1))[0] & 1];
        localStorage.setItem(armKey, selected);
      }

      const session = readSession();
      const pending = session.pendingSwitch;
      if (pending) {
        delete session.pendingSwitch;
        writeSession(session);
      }
      const switchURL = new URL(url);
      switchURL.searchParams.delete("ab_switch");
      const explicitDestination = isBusiness ? switchURL.search === "" :
        switchURL.pathname.endsWith("/index.html") && switchURL.search === "?view=terminal";
      if (explicitDestination && armNames.includes(selected) && url.searchParams.get("ab_switch") === "1" &&
          pending && pending.arm === selected && pending.href === url.href &&
          Date.now() >= pending.at && Date.now() - pending.at < 15000) {
        history.replaceState({ [stateKey]: selected, meetingLabSwitch: true }, "", switchURL.href);
        arm = selected;
        enrolled = continued = true;
      } else if (explicitDestination && !url.searchParams.has("ab_switch") && historySwitch &&
                 historyArm === selected && armNames.includes(selected)) {
        writeSession(session);
        arm = selected;
        enrolled = continued = true;
      } else if (rootEntry && selected === "business") {
        const session = readSession();
        session.pendingBusiness = true;
        writeSession(session);
        location.replace(new URL("business.html?ab=business", url).href);
        return;
      } else if (isBusiness && selected === "business" && url.search === "?ab=business" && !url.hash) {
        const session = readSession();
        if (session.pendingBusiness === true) {
          delete session.pendingBusiness;
          writeSession(session);
          url.search = "";
          history.replaceState({ [stateKey]: "business" }, "", url.href);
          enrolled = true;
        }
      } else if (selected === arm && ((rootEntry && arm === "terminal") ||
                 (historyArm === arm && !url.search && !url.hash &&
                   (isBusiness || url.pathname.endsWith("/"))))) {
        const session = readSession();
        writeSession(session);
        if (rootEntry && url.search) {
          // Never carry campaign values into the randomized edition or refreshed URL.
          url.search = "";
          history.replaceState({ [stateKey]: arm }, "", url.href);
        } else if (historyArm !== arm) {
          history.replaceState({ [stateKey]: arm }, "");
        }
        enrolled = true;
      }
    } catch {
      // Blocked storage/history must not break either page or leak events.
      enrolled = false;
    }
  }

  showWaitlist(enrolled ? config[arm + "Form"] : generalForm);
  if (!enrolled) return;

  function sendOnce(event) {
    if (!enrolled || declined() || !eventNames.includes(event)) return;
    try {
      const session = readSession();
      if (session[event] === arm) return;
      session[event] = arm;
      writeSession(session);
      fetch(config.endpoint, {
        method: "POST",
        mode: "no-cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        keepalive: true,
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ experiment, arm, event }),
      }).catch(() => {});
    } catch {
      // No retry or queue: these are best-effort anonymous counts.
    }
  }

  for (const link of document.querySelectorAll("[data-variant-switch]")) {
    link.addEventListener("click", event => {
      if (!event.isTrusted || event.defaultPrevented || declined() || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
          (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      try {
        const here = new URL(location.href);
        const href = new URL(link.href, here);
        const expected = new URL(isBusiness ? "index.html?view=terminal" : "business.html", here);
        if (href.origin !== expected.origin || href.pathname !== expected.pathname ||
            href.search !== expected.search) return;
        href.searchParams.set("ab_switch", "1");
        const session = readSession();
        session.pendingSwitch = {arm, href: href.href, at: Date.now()};
        writeSession(session);
        event.preventDefault();
        sendOnce("variant_switch");
        location.assign(href.href);
      } catch {
        // Keep the normal, unbucketed link if the handoff cannot be written.
      }
    });
  }

  // Attribution for a voluntary switch is intention-to-treat. Do not count
  // the selected edition as a new randomized impression or attention exposure.
  if (continued) return;

  function impression() {
    if (document.visibilityState === "visible") sendOnce("impression");
  }
  impression();
  document.addEventListener("visibilitychange", impression);

  let lastActiveAt = null;
  let total = 0;
  try {
    const session = readSession();
    if (session.attention === arm) return;
    if (session.visibleArm === arm && Number.isFinite(session.visibleMs)) {
      total = Math.max(0, Math.min(10000, session.visibleMs));
    }
  } catch {
    return;
  }

  let interval;
  function tick(forceInactive = false) {
    const now = performance.now();
    if (lastActiveAt !== null) {
      // Limit unexpectedly long ticks, e.g. sleeping devices or throttled tabs.
      total = Math.min(10000, total + Math.max(0, Math.min(1000, now - lastActiveAt)));
      try {
        const session = readSession();
        session.visibleArm = arm;
        session.visibleMs = total;
        writeSession(session);
      } catch {
        clearInterval(interval);
        return;
      }
    }
    lastActiveAt = !forceInactive && !declined() && document.visibilityState === "visible" &&
      document.hasFocus() ? now : null;
    if (total >= 10000) {
      lastActiveAt = null;
      clearInterval(interval);
      sendOnce("attention");
    }
  }
  tick();
  interval = setInterval(tick, 250);
  document.addEventListener("visibilitychange", () => tick());
  window.addEventListener("focus", () => tick());
  window.addEventListener("blur", () => tick(true));
  window.addEventListener("pagehide", () => tick(true));
  window.addEventListener("pageshow", () => tick());
})();
