# Bistek Village — Community Dues Admin

A monthly village-dues dashboard for Bistek Village. It tracks community dues rather than the rent or sale value of residents' houses. Built with separate HTML pages, vanilla JavaScript, and Tailwind CSS—no framework or build step required.

## Pages

- `index.html` — public Bistek Village landing page
- `login.html` — admin-only demo sign-in; there is no sign-up page
- `dashboard.html` — protected community overview
- `residents.html` — resident directory and add-resident form
- `payments.html` — monthly village-dues register
- `map.html` — subdivision lot map
- `reports.html` — collection breakdown and CSV export
- `settings.html` — community settings

Shared assets are in `styles.css`, `app-shell.js`, `app.js`, and `auth.js`. Open `index.html` to view the village landing page, or choose Administrator sign in to open the dashboard. Tailwind CSS and the optional fonts load from CDNs, so an internet connection is needed for those assets.

## Demo sign-in

- Email: `admin@haven.local`
- Password: `HavenAdmin2026`

The sign-in is a client-side demo gate only. It is not secure authentication: browser storage and static files can be inspected or bypassed. Do not deploy it or enter real resident data until you connect a server-side authentication system and protected database.

The demo dues are set to ₱500 per resident per month as an editable placeholder; set Bistek Village's actual dues in Settings. Existing rent-demo records are converted to this dues placeholder the first time the updated app opens. Resident and dues records are saved in this browser using `localStorage`; they are not synchronized between devices.
