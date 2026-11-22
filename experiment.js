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
  if (!config.enabled || !endpointURL.test(config.endpoint) || !formURL.test(config.terminalForm) ||
      !formURL.test(config.businessForm) || config.terminalForm === config.businessForm) return;

  const generalForm = formURL.test(config.generalForm) &&
    ![config.terminalForm, config.businessForm].includes(config.generalForm) ? config.generalForm : "";
  const isBusiness = location.pathname.endsWith("/business.html");
  const arm = isBusiness ? "business" : "terminal";
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

  if (!declined() && window.crypto && window.fetch) {
    try {
      const url = new URL(location.href);
      const rootEntry = url.pathname.endsWith("/") && !url.search && !url.hash;
      const historyArm = history.state && history.state[stateKey];
      let selected = localStorage.getItem(armKey);

      if (rootEntry && !armNames.includes(selected)) {
        // One unbiased random bit, persisted as an arm, never as a visitor ID.
        selected = armNames[crypto.getRandomValues(new Uint8Array(1))[0] & 1];
        localStorage.setItem(armKey, selected);
      }

      if (rootEntry && selected === "business") {
        const session = readSession();
        session.pendingBusiness = true;
        writeSession(session);
        location.replace(new URL("business.html?ab=business", url).href);
        return;
      }

      if (isBusiness && selected === "business" && url.search === "?ab=business" && !url.hash) {
        const session = readSession();
        if (session.pendingBusiness === true) {
          delete session.pendingBusiness;
          writeSession(session);
          url.search = "";
          history.replaceState({ [stateKey]: "business" }, "", url.href);
          enrolled = true;
        }
      } else if (selected === arm && ((rootEntry && arm === "terminal") ||
                 (historyArm === arm && url.search === "" &&
                   (isBusiness || url.pathname.endsWith("/"))))) {
        const session = readSession();
        writeSession(session);
        if (historyArm !== arm) history.replaceState({ [stateKey]: arm }, "");
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
      if (event.isTrusted && !event.defaultPrevented) sendOnce("variant_switch");
    });
  }

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
