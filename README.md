# Bistekville Community Dues Admin

A static, multi-page community dues dashboard built with vanilla JavaScript and Tailwind CSS. See [FIREBASE-SETUP.md](FIREBASE-SETUP.md) to connect Firebase Authentication and Cloud Firestore.

## Pages

- `index.html` — public landing page
- `login.html` — administrator sign-in
- `dashboard.html` — community overview
- `residents.html` — resident directory
- `payments.html` — monthly dues register
- `payment-history.html` — resident payment history by month
- `reports.html` — collection breakdown and CSV export
- `settings.html` — community settings

Firebase uses browser ES modules from Google's CDN, so serve this folder over HTTP rather than opening pages as `file://`. No build step is required.
