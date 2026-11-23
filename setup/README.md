# Turn on the Meeting Lab experiment

GitHub Pages serves files only. This small Google Apps Script provides the write
endpoint for anonymous event counters; two equivalent forms measure completed
signups separately. A third, identical form is for visitors outside the test.
No new server, scheduled job, dashboard subscription, public spreadsheet, or
external analytics account is required.

## One-time setup by the account owner

1. In [Google Apps Script](https://script.google.com/home), create a fresh project.
   Paste [Waitlist.gs](Waitlist.gs) into `Code.gs`. Do not add unrelated handlers.
   Run `prepareMeetingLab` and review Google's permission prompt. The execution
   log contains three grouped form editor/responder links. It does not contain
   responses. If an existing untouched form must be used, do not edit the script
   blindly; ask the site maintainer to reconcile the destinations first.
2. In each **editor** link, publish for anyone with the responder link. Check
   signed out that all three show the same required email field, can accept
   responses without login, and do not expose response summaries. Keep editor
   links, form responses and exports private. Do not post test responses to the
   live forms after the experiment starts.
3. Leave production **unarmed**. Select **Deploy → New deployment → Web app**,
   **Execute as: Me**, **Who has access: Anyone** (not anyone with a Google
   account). The public endpoint is write-only and ignores events while
   unarmed. If your organization disallows anonymous web apps, stop rather
   than weakening its policy.
4. Give the site maintainer only the deployed HTTPS **`/exec`** URL and the three
   **responder** URLs, labeled terminal, business, and general. Never share edit
   links, passwords, or response files. Keep the site’s experiment disabled
   while checking the production responder links signed out, without submitting.
   Keep the arm links out of public circulation until launch.

## Qualify, then start the live run

- Start with the [local checks](../README.md#pages-and-local-checks). For a
  signed-out end-to-end rehearsal, use a separate disposable Apps Script
  project, three separate forms, and that project's own anonymous `/exec`.
  Google's `/dev` URL is editor-only, and deploying another version of the
  same project does not isolate its script properties.
- In that rehearsal only, verify the randomized routes and send synthetic
  events and form submissions. Check actual changes in `reportMeetingLab`:
  each event and completed signup must appear in the expected arm, and a
  general-form signup must not enter either arm. The endpoint replies
  `received` even when an event is ignored, so a response alone proves no count.
- When the production Pages change is ready to publish, the owner runs
  `armExperiment` immediately before the maintainer publishes the qualified
  configuration. The first arm starts the report window; a second call
  cannot reset counters, move the start, or undo a pause. Do not send synthetic
  requests or submissions to production. After arming, the owner can use the
  private report to inspect the window and counts without generating traffic.

## Read the funnel

From the project editor run `reportMeetingLab`. It outputs aggregate rows by
arm: impressions, 10-second attention, edition switches, waitlist clicks, and
completed Google Form submissions. The general form is excluded from the split.
Clicks are not signups. Treat these as directional session rates; blockers,
repeat sessions, shared form links, duplicate submissions, and unmeasured
manual navigation can bias them. The endpoint cannot authenticate a public
browser; it discards invalid payloads and stores only allowed whole-number
counts, but does not promise bot resistance.

To end the run, run `pauseExperiment` and have the site maintainer disable
the experiment. The first pause permanently records a UTC cutoff and stops
event collection. The final report counts form submissions only inside the
start/cutoff window; later submissions do not change it. This does not close
the forms or erase counters. The finished experiment cannot be re-armed; use
a separately versioned run and fresh counters to measure again. Archive the
web-app deployment and close arm forms when no longer needed.

[Google's web app deployment guide](https://developers.google.com/apps-script/guides/web)
· [Google Forms responder publication help](https://support.google.com/docs/answer/2839588)
