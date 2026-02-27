# GitHub Pages setup for Privacy Policy URL

Use this to get a free HTTPS URL for Google Play Console.

## 1) Push this repo to GitHub

If not already pushed:

1. Create a new GitHub repository.
2. Push this project.

## 2) Enable GitHub Pages

1. Open your repo on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (or your default branch), folder `/ (root)`
4. Save.

## 3) Wait for publish

GitHub will generate a URL like:

`https://<your-github-username>.github.io/<repo-name>/privacy-policy.html`

## 4) Use this in Play Console

In Google Play Console, paste that URL in:

**App content → Privacy Policy**

---

## Notes

- File to publish is: `privacy-policy.html`
- If your branch is not `main`, choose the one you use.
- Any update to `privacy-policy.html` on the selected branch updates the live page.
