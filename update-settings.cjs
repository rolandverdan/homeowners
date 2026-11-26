const fs = require("node:fs");

const file = "settings.html";
let html = fs.readFileSync(file, "utf8");
const marker = '      <section class="panel admin-account-panel">';
const appSection = `      <section class="panel app-install-panel">
        <div class="panel-heading"><div><p class="eyebrow">ANDROID APP</p><h2>Install the Android app</h2></div></div>
        <div class="app-install-content">
          <p>Download the Bistek Village Admin APK on your Android device. Open the downloaded file and follow Android's prompts to install it.</p>
          <a class="button button-primary" href="./downloads/bistek-village-admin.apk" download="Bistek-Village-Admin.apk">Download APK</a>
          <small>If prompted, allow your browser to install unknown apps.</small>
        </div>
      </section>
`;
if (!html.includes(marker)) throw new Error("Settings page insertion point not found.");
if (!html.includes("./downloads/bistek-village-admin.apk")) {
  html = html.replace(marker, appSection + marker);
  fs.writeFileSync(file, html, "utf8");
}
