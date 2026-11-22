"use strict";
const {readFileSync} = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const path = require("node:path");

const source = readFileSync(path.join(__dirname, "../experiment.js"), "utf8");
const form = name => "https://docs.google.com/forms/d/e/" + name + "/viewform";
const endpoint = "https://script.google.com/macros/s/test/exec";
const patch = (script, key, value) => script.replace(new RegExp(key + ': (?:true|false|"[^"]*")'), key + ": " + JSON.stringify(value));
const inactive = patch(patch(source, "enabled", false), "generalForm", "");
const live = Object.entries({enabled: true, endpoint, terminalForm: form("t"), businessForm: form("b"), generalForm: form("g")})
  .reduce((script, [key, value]) => patch(script, key, value), inactive);
const site = "https://example.invalid/meeting-lab/";
const settings = () => ({local: new Map(), session: new Map()});

function load(relative, shared, options = {}) {
  const local = shared.local;
  const sess = shared.session;
  const storage = m => ({
    getItem(key) {
      if (options.denied === "read") throw Error("restricted");
      return m.get(key) ?? null;
    },
    setItem(key, value) {
      if (options.denied === "write") throw Error("restricted");
      m.set(key, value);
    },
  });
  let url = new URL(relative, site);
  let visible = options.visible ?? true;
  let focused = options.focused ?? true;
  let time = 0;
  let nextId = 0;
  const timers = new Map(), calls = [], windowEvents = new Map(), documentEvents = new Map();
  const on = (map, name, callback) => map.set(name, [...(map.get(name) || []), callback]);
  const fire = (map, name) => (map.get(name) || []).forEach(fn => fn());
  const clickable = () => ({
    addEventListener(name, fn) { this[name] = fn; },
    follow(isTrusted = true) { this.click?.({isTrusted, defaultPrevented: false}); },
  });
  const switcher = clickable(), markup = {replaceChildren(link) { this.link = link; }};
  let redirected;
  const context = {
    navigator: options.navigator || {},
    URL,
    performance: {now: () => time},
    setInterval(callback, duration) {
      const id = ++nextId;
      timers.set(id, {callback, duration, next: time + duration});
      return id;
    },
    clearInterval(id) { timers.delete(id); },
    localStorage: storage(local), sessionStorage: storage(sess),
    location: {
      get href() { return url.href; },
      get pathname() { return url.pathname; },
      replace(destination) { redirected = destination; },
    },
    history: {
      state: options.state ?? null,
      replaceState(state, _title, destination) {
        this.state = state;
        if (destination) url = new URL(destination, url);
      },
    },
    crypto: {getRandomValues(bytes) { bytes[0] = options.random ?? 0; return bytes; }},
    fetch(to, init) {
      calls.push({to, ...init, body: JSON.parse(init.body)});
      return Promise.resolve();
    },
    document: {
      querySelector: selector => selector === "[data-waitlist]" ? markup : null,
      querySelectorAll: () => [switcher],
      createElement: clickable,
      get visibilityState() { return visible ? "visible" : "hidden"; },
      hasFocus: () => focused,
      addEventListener: (event, fn) => on(documentEvents, event, fn),
    },
    addEventListener: (event, fn) => on(windowEvents, event, fn),
  };
  context.window = context;
  vm.runInNewContext(options.js || live, context);
  return {
    calls, switcher, markup, context,
    get redirected() { return redirected; },
    get url() { return url.href; },
    advance(ms) {
      const target = time + ms;
      while (true) {
        const next = Math.min(...[...timers.values()].map(timer => timer.next));
        if (next > target) break;
        time = next;
        for (const timer of timers.values()) if (timer.next === time) {
          timer.next += timer.duration;
          timer.callback();
        }
      }
      time = target;
    },
    visible(isVisible) { visible = isVisible; fire(documentEvents, "visibilitychange"); },
    focus(isFocused) { focused = isFocused; fire(windowEvents, focused ? "focus" : "blur"); },
  };
}
const events = page => page.calls.map(record => record.body.event);
const armKey = "meeting-lab-v1:arm";
{
  for (const js of [inactive, patch(live.replace(form("b"), form("t")), "generalForm", ""), patch(live.replace(endpoint, "https://bad.invalid/exec"), "generalForm", ""), patch(live.replace(form("t"), form("t").replace("/viewform", "/edit")), "generalForm", "")]) {
    const storage = settings(), page = load("", storage, {js});
    assert.equal(storage.local.size, 0);
    assert.equal(page.redirected, undefined);
    assert.equal(page.markup.link, undefined);
    assert.deepEqual(events(page), []);
  }
}
{
  const generalOnly = patch(inactive, "generalForm", form("g"));
  for (const js of [generalOnly, patch(live, "enabled", false), patch(live, "endpoint", ""), patch(live, "businessForm", "")]) {
    for (const relative of ["?ref=producthunt&utm_source=campaign", "business.html"]) {
      const storage = settings(), page = load(relative, storage, {js, random: 1});
      assert.equal(page.markup.link.href, form("g"));
      page.markup.link.follow();
      page.switcher.follow();
      page.advance(20000);
      assert.deepEqual(events(page), []);
      assert.equal(page.redirected, undefined);
      assert.equal(storage.local.size + storage.session.size, 0);
    }
  }
  const conflictingGeneral = patch(patch(live, "enabled", false), "generalForm", form("b"));
  assert.equal(load("", settings(), {js: conflictingGeneral}).markup.link, undefined);
}
{
  const campaign = "?ref=producthunt&utm_source=campaign";
  for (const random of [0, 1]) {
    const storage = settings(), start = load(campaign, storage, {random});
    const shown = random ? load(start.redirected, storage) : start;
    assert.equal(shown.url, site + (random ? "business.html" : ""));
    assert.equal(shown.markup.link.href, form(random ? "b" : "t"));
    assert.deepEqual(events(shown), ["impression"]);
    assert.equal(JSON.stringify(shown.calls).includes("producthunt"), false);
    assert.equal(JSON.stringify([...storage.session]).includes("campaign"), false);
    const reload = load(shown.url, storage, {state: shown.context.history.state});
    assert.equal(reload.markup.link.href, shown.markup.link.href);
    assert.deepEqual(events(reload), []);
    for (const direct of ["business.html?ref=producthunt", "index.html?view=terminal",
      "?ref=producthunt&view=terminal", "?ref=producthunt#early-access"]) {
      const page = load(direct, storage);
      assert.equal(page.markup.link.href, form("g"));
      assert.deepEqual(events(page), []);
    }
  }
}
{
  const alternativeResponder = form("t").replace("/d/e/", "/d/");
  const page = load("", settings(), {js: live.replace(form("t"), alternativeResponder)});
  assert.equal(page.markup.link.href, alternativeResponder);
}
{
  // Each possible byte produces a 128/128 split and stores only its arm.
  const counts = {terminal: 0, business: 0};
  for (let random = 0; random < 256; random++) {
    const storage = settings(), page = load("", storage, {random});
    const arm = storage.local.get(armKey);
    assert.deepEqual([...storage.local], [[armKey, arm]]);
    counts[arm]++;
    assert.equal(Boolean(page.redirected), arm === "business");
  }
  assert.deepEqual(counts, {terminal: 128, business: 128});
}
{
  const storage = settings();
  const start = load("", storage, {random: 1});
  assert.equal(start.redirected, site + "business.html?ab=business");
  assert.deepEqual(events(start), []);
  const page = load(start.redirected, storage, {random: 0});
  assert.equal(page.url, site + "business.html");
  assert.equal(page.markup.link.href, form("b"));
  assert.deepEqual(events(page), ["impression"]);
  page.advance(5000);
  const reload = load(page.url, storage, {state: page.context.history.state});
  assert.deepEqual(events(reload), []);
  reload.advance(4999);
  assert.deepEqual(events(reload), []);
  reload.advance(1);
  assert.deepEqual(events(reload), ["attention"]);
  assert.equal(load("", storage, {random: 0}).redirected, start.redirected);
  const manuallyChosen = load("business.html", storage);
  assert.equal(manuallyChosen.markup.link.href, form("g"));
  manuallyChosen.markup.link.follow();
  assert.deepEqual(events(manuallyChosen), []);
  assert.deepEqual(events(load("index.html?view=terminal#teach-back-title", storage)), []);
}
{
  const storage = settings(), page = load("", storage);
  assert.equal(page.markup.link.href, form("t"));
  page.advance(4000);
  page.focus(false);
  page.advance(60000);
  page.focus(true);
  page.advance(2000);
  page.visible(false);
  page.advance(60000);
  page.visible(true);
  page.advance(4000);
  page.advance(1000);
  page.markup.link.follow(false);
  page.markup.link.follow();
  page.markup.link.follow();
  page.switcher.follow();
  page.switcher.follow();
  assert.deepEqual(events(page), ["impression", "attention", "waitlist_click", "variant_switch"]);
  assert.deepEqual(events(load("", storage, {random: 1})), []);
  for (const request of page.calls) {
    assert.equal(request.to, endpoint);
    assert.equal(request.method, "POST");
    assert.equal(request.mode, "no-cors");
    assert.equal(request.credentials, "omit");
    assert.equal(request.referrerPolicy, "no-referrer");
    assert.equal(request.keepalive, true);
    assert.equal(request.headers["Content-Type"], "text/plain");
    assert.deepEqual(request.body, {experiment: "meeting-lab-v1", arm: "terminal", event: request.body.event});
  }
}
{
  const page = load("", settings(), {visible: false, focused: false});
  page.advance(30000);
  assert.deepEqual(events(page), []);
  page.visible(true);
  page.advance(30000);
  assert.deepEqual(events(page), ["impression"]);
  page.focus(true);
  page.advance(10000);
  assert.deepEqual(events(page), ["impression", "attention"]);
}
{
  for (const [relative, options] of [
    ["business.html", {}], ["business.html?ab=business", {random: 1}],
    ["index.html?view=terminal", {}], ["#early-access", {}], ["?utm_not_standard=test", {}], ["?utm_source=ok&view=terminal", {}],
    ["?ref=ok&debug=1", {}], ["?ref=ok&version=v2", {}], ["?ref=ok&ab=business", {}],
    ["?utm_medium=organic#proof", {}],
    ["", {navigator: {globalPrivacyControl: true}, random: 1}],
    ["", {navigator: {doNotTrack: "1"}}], ["", {denied: "write"}], ["", {denied: "read"}],
  ]) {
    const page = load(relative, settings(), options);
    page.markup.link.follow();
    page.switcher.follow();
    page.advance(20000);
    assert.equal(page.markup.link.href, form("g"));
    assert.equal(page.redirected, undefined);
    assert.deepEqual(events(page), []);
  }
}
console.log("PASS: inactive general signup, allowlisted campaign entry, refresh and routing, invalid config, exact 50/50 byte split, sticky arm, one-time business handoff, direct/switch and preference exclusions, focused visible time, event deduplication and fixed analytics contract.");
