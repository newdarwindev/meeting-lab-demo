# Meeting Lab

[Visit the public demo](https://newdarwindev.github.io/meeting-lab-demo/)

Static public concept page for the planned Meeting Lab product. The Deck workstation has component-level runtime validation. Lima’s layout is documented and its sample release board is synthetic. The combined browser-call workflow is not presented as shipped. All five images are concept artwork, not production screenshots, and are served locally.

## Preview

Run `python3 -m http.server 8080` from the repository root, then open `http://localhost:8080`. Run `python3 scripts/check_site.py` for static validation.

## Waitlist

The only external signup destination belongs inside the element marked `data-waitlist` at the end of `index.html`. Replace its placeholder paragraph with one accessible link and a short privacy statement after an approved HTTPS signup destination is ready:

```html
<p data-waitlist><a class="launch" href="https://signup.example/">Join the waitlist <span aria-hidden="true">↗</span></a></p>
```

The static site does not submit or store signup information. Do not place responses or form credentials in this repository. The section navigation links remain local and need no changes. Test the form from a signed-out browser with synthetic data before announcing the waitlist.

## Publish on GitHub Pages

In the repository's **Settings → Pages**, select **Deploy from a branch**, then choose `main` and `/ (root)`. Keep `.nojekyll` in place. The page uses relative asset URLs so it works both at a local root and below the repository-name path. After Pages reports deployment, verify the published URL, all five images and the waitlist link in a signed-out browser. No custom GitHub Actions workflow is required.
