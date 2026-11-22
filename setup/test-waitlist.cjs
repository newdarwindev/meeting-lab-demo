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
let now = '2026-11-22T12:00:00.000Z';
class MockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
}
const context = vm.createContext({
  Date: MockDate,
  PropertiesService: {getScriptProperties: () => properties},
  LockService: {getScriptLock: () => lock},
  ContentService: {createTextOutput: s => s},
  console: {log: v => logs.push(v)},
  FormApp: {openById: id => ({
    isPublished: () => true,
    isAcceptingResponses: () => true,
    isPublishingSummary: () => false,
    getResponses: from => {
      assert.equal(from.toISOString(), '2026-11-22T00:00:00.000Z');
      return ['a', 'b', 'g'].includes(id) ? [
        '2026-11-21T23:59:59.999Z', '2026-11-22T12:00:00.000Z',
        '2026-11-22T12:00:00.001Z', '2026-11-22T20:00:00.000Z',
      ].map(time => ({email: 'do-not-log@example.invalid', getTimestamp: () => new Date(time)})) : [];
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
assert.equal(values.has('cutoff'), false, 'Unarmed pause must not close future first start');
values.set('start', '2026-11-22T00:00:00.000Z');
values.set('open', 'yes');
context.pauseExperiment();
assert.equal(values.get('cutoff'), now);
post(valid);
assert.equal(values.get('count.terminal.impression'), '2');
now = '2026-11-22T20:30:00.000Z';
context.pauseExperiment();
assert.equal(values.get('cutoff'), '2026-11-22T12:00:00.000Z');
values.set('open', 'yes'); // A stale property must not reopen a finished experiment.
post(valid);
assert.equal(values.get('count.terminal.impression'), '2');
values.delete('open');
values.set('form.terminal', 'a');
values.set('form.business', 'b');
values.set('form.general', 'g');
for (const arm of ['terminal', 'business', 'general']) values.set('prepared.' + arm, 'yes');
assert.throws(() => context.armExperiment(), /Experiment is finished/);
assert.equal(values.has('open'), false);
context.reportMeetingLab();
assert.equal(logs.length, 1);
assert.equal(logs[0].includes('@'), false);
const report = JSON.parse(logs[0]);
assert.equal(report.rows[0].signupPct, 50);
assert.equal(report.rows[1].signupPct, 50);
assert.equal(report.generalExcluded, 1);
assert.equal(report.cutoff, '2026-11-22T12:00:00.000Z');
assert.equal(report.through, report.cutoff);
now = '2026-11-24T20:30:00.000Z';
context.reportMeetingLab();
assert.equal(logs[1], logs[0]);
console.log('PASS: disabled/paused, strict payload, both arms, permanent cutoff, refusal to re-arm, aggregate-only report and bounded completions.');
