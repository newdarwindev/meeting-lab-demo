/**
 * Meeting Lab pilot: aggregate events and three private-response Forms.
 * Deploy ONLY this project. The public web app has no read endpoint.
 */
const EXPERIMENT = 'meeting-lab-v1';
const FORMS = ['terminal', 'business', 'general'];
const ARMS = ['terminal', 'business'];
const EVENTS = ['impression', 'attention', 'waitlist_click', 'variant_switch'];

function prepareMeetingLab() {
  const store = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const output = {};
    FORMS.forEach(function (arm) {
      let id = store.getProperty('form.' + arm);
      const form = id ? FormApp.openById(id) : FormApp.create('Meeting Lab Early Access', false);
      if (!id) {
        id = form.getId();
        store.setProperty('form.' + arm, id);
      }
      if (!store.getProperty('prepared.' + arm)) {
        // If setup stopped mid-flight, do not silently duplicate questions.
        if (form.getItems().length === 0) {
          form.addTextItem().setTitle('Email address').setRequired(true)
              .setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
        }
        if (form.getItems().length !== 1) throw new Error('Review ' + arm + ' form before continuing.');
        form.setDescription('We’ll use your email only to contact you about Meeting Lab early access.')
            .setCollectEmail(false).setLimitOneResponsePerUser(false)
            .setPublishingSummary(false).setAllowResponseEdits(false)
            .setShowLinkToRespondAgain(false)
            .setConfirmationMessage('You’re on the Meeting Lab early-access list.');
        store.setProperty('prepared.' + arm, 'yes');
      }
      output[arm] = {editor: form.getEditUrl(), responder: form.getPublishedUrl()};
    });
    // Visible to the script owner only. Share responder URLs, never editor URLs.
    console.log(JSON.stringify(output));
  } finally {
    lock.releaseLock();
  }
}

function armExperiment() {
  const store = PropertiesService.getScriptProperties();
  if (!FORMS.every(arm => store.getProperty('prepared.' + arm))) {
    throw new Error('Run prepareMeetingLab and verify each form first.');
  }
  FORMS.forEach(function (arm) {
    const form = FormApp.openById(store.getProperty('form.' + arm));
    if (!form.isPublished() || !form.isAcceptingResponses() || form.isPublishingSummary()) {
      throw new Error('Check publication and response privacy for ' + arm + '.');
    }
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (store.getProperty('cutoff')) throw new Error('Experiment is finished. Create a new version to run again.');
    if (!store.getProperty('start')) store.setProperty('start', new Date().toISOString());
    store.setProperty('open', 'yes');
  } finally {
    lock.releaseLock();
  }
}

function pauseExperiment() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const store = PropertiesService.getScriptProperties();
    if (store.getProperty('start') && !store.getProperty('cutoff')) {
      store.setProperty('cutoff', new Date().toISOString());
    }
    store.deleteProperty('open');
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  const output = () => ContentService.createTextOutput('received');
  const p = e && e.postData;
  if (!p || typeof p.contents !== 'string' || p.contents.length > 140 ||
      !/^text\/plain(?:;|$)/i.test(p.type || '')) return output();
  let row;
  try { row = JSON.parse(p.contents); } catch (_) { return output(); }
  if (!row || typeof row !== 'object' || Array.isArray(row) ||
      Object.keys(row).sort().join(',') !== 'arm,event,experiment' ||
      row.experiment !== EXPERIMENT || !ARMS.includes(row.arm) || !EVENTS.includes(row.event)) {
    return output();
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2500)) return output();
  try {
    const store = PropertiesService.getScriptProperties();
    if (store.getProperty('open') !== 'yes' || store.getProperty('cutoff')) return output();
    const key = 'count.' + row.arm + '.' + row.event;
    const n = Number(store.getProperty(key) || 0);
    if (Number.isSafeInteger(n) && n >= 0 && n < Number.MAX_SAFE_INTEGER) {
      store.setProperty(key, String(n + 1));
    }
  } finally {
    lock.releaseLock();
  }
  return output();
}

function reportMeetingLab() {
  const s = PropertiesService.getScriptProperties();
  const start = s.getProperty('start');
  if (!start) throw new Error('Experiment has not been armed.');
  const from = new Date(start);
  const cutoff = s.getProperty('cutoff') || null;
  const through = cutoff ? new Date(cutoff) : new Date();
  const completedInWindow = arm => FormApp.openById(s.getProperty('form.' + arm))
      .getResponses(from).filter(response => {
        const time = response.getTimestamp();
        return time >= from && time <= through;
      }).length;
  const rates = (n, d) => d > 0 ? Math.round(10000 * n / d) / 100 : null;
  const rows = ARMS.map(function (arm) {
    const count = event => Number(s.getProperty('count.' + arm + '.' + event) || 0);
    const impressions = count('impression');
    const attentive = count('attention');
    const clicks = count('waitlist_click');
    const switches = count('variant_switch');
    const completed = completedInWindow(arm);
    return {arm, impressions, attentive, clicks, switches, completed,
      attentionPct: rates(attentive, impressions), clickPct: rates(clicks, impressions),
      signupPct: rates(completed, impressions)};
  });
  const general = completedInWindow('general');
  // Never log form answers, email addresses, raw HTTP requests or identifiers.
  console.log(JSON.stringify({start, cutoff, through: through.toISOString(), rows, generalExcluded: general}, null, 2));
}
