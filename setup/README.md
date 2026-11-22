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
3. Run `armExperiment`. Select **Deploy → New deployment → Web app**,
   **Execute as: Me**, **Who has access: Anyone** (not anyone with a Google
   account). This publishes a write-only endpoint. If your organization
   disallows anonymous web apps, stop rather than weakening its policy.
4. Give the site maintainer only the deployed HTTPS **`/exec`** URL and the three
   **responder** URLs, labeled terminal, business, and general. Never share edit
   links, passwords, or response files. The site remains unmeasured until
   configuration and the deployed variant paths are verified.

## Read the funnel

From the project editor run `reportMeetingLab`. It outputs aggregate rows by
arm: impressions, 10-second attention, edition switches, waitlist clicks, and
completed Google Form submissions. The general form is excluded from the split.
Clicks are not signups. Treat these as directional session rates; blockers,
repeat sessions, shared form links, duplicate submissions, and unmeasured
manual navigation can bias them. The endpoint cannot authenticate a public
browser; it discards invalid payloads and stores only allowed whole-number
counts, but does not promise bot resistance.

To pause collection immediately, run `pauseExperiment` and have the site
maintainer disable the experiment. Pausing does not erase counters or close
the forms. If stopping entirely, archive the web-app deployment and close the
forms when no longer needed.

[Google's web app deployment guide](https://developers.google.com/apps-script/guides/web)
· [Google Forms responder publication help](https://support.google.com/docs/answer/2839588)
