'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const values = new Map();
const properties = {
  getProperty: k => values.get(k),
  setProperty: (k, v) => values.set(k, v),
  deleteProperty: k => values.delete(k),
};
const lock = {tryLock: () => true, waitLock: () => {}, releaseLock: () => {}};
const logs = [];
const context = vm.createContext({
  PropertiesService: {getScriptProperties: () => properties},
  LockService: {getScriptLock: () => lock},
  ContentService: {createTextOutput: s => s},
  console: {log: v => logs.push(v)},
  FormApp: {openById: id => ({
    getResponses: from => {
      assert.equal(from.toISOString(), '2026-11-22T00:00:00.000Z');
      return ['a', 'b', 'g'].includes(id) ? [{email: 'do-not-log@example.invalid'}] : [];
    }
  })},
});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'Waitlist.gs'), 'utf8'), context);
const valid = {experiment: 'meeting-lab-v1', arm: 'terminal', event: 'impression'};
const post = (body, type = 'text/plain; charset=UTF-8') => {
  assert.equal(context.doPost({postData: {type, contents: JSON.stringify(body)}}), 'received');
};
post(valid);
assert.equal(values.size, 0);
values.set('open', 'yes');
for (const invalid of [
  null, [], {...valid, experiment: 'future'}, {...valid, arm: 'general'},
  {...valid, event: 'submitted'}, {...valid, email: 'do-not-log@example.invalid'},
  {...valid, event: 'a'.repeat(200)}
]) post(invalid);
post(valid, 'application/json');
assert.equal(values.size, 1);
for (const arm of ['terminal', 'business']) {
  for (const event of ['impression', 'attention', 'waitlist_click', 'variant_switch']) {
    post({...valid, arm, event});
    post({...valid, arm, event});
    assert.equal(values.get('count.' + arm + '.' + event), '2');
  }
}
context.pauseExperiment();
post(valid);
assert.equal(values.get('count.terminal.impression'), '2');
values.set('start', '2026-11-22T00:00:00.000Z');
values.set('form.terminal', 'a');
values.set('form.business', 'b');
values.set('form.general', 'g');
context.reportMeetingLab();
assert.equal(logs.length, 1);
assert.equal(logs[0].includes('@'), false);
const report = JSON.parse(logs[0]);
assert.equal(report.rows[0].signupPct, 50);
assert.equal(report.rows[1].signupPct, 50);
assert.equal(report.generalExcluded, 1);
console.log('PASS: disabled/paused, strict payload, both arms, aggregate-only report, separate completions.');
