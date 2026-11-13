import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath, URL } from "node:url";
import console from "node:console";
import { ConsoleLog, TwaGenerator, TwaManifest } from "@bubblewrap/core";

const publicDirectory = new URL("../public/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", publicDirectory)));
const { origin, packageId } = JSON.parse(await readFile(new URL("./app.json", import.meta.url)));
const output = fileURLToPath(new URL("./generated", import.meta.url));
const icons = new Map();
for (const filename of ["app-icon-512.png", "app-icon-maskable-512.png"]) {
  icons.set(`/${filename}`, await readFile(new URL(`brand/${filename}`, publicDirectory)));
}
// Bubblewrap fetches icons over HTTP. Serve only these build assets on loopback.
const server = createServer((request, response) => {
  const icon = icons.get(request.url);
  if (!icon) return response.writeHead(404).end();
  response.writeHead(200, { "content-type": "image/png" }).end(icon);
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const assetOrigin = `http://127.0.0.1:${server.address().port}`;

const androidManifest = new TwaManifest({
  packageId,
  host: new URL(origin).host,
  name: manifest.name,
  launcherName: manifest.short_name,
  startUrl: manifest.start_url,
  display: manifest.display,
  themeColor: manifest.theme_color,
  navigationColor: manifest.background_color,
  backgroundColor: manifest.background_color,
  iconUrl: `${assetOrigin}/app-icon-512.png`,
  maskableIconUrl: `${assetOrigin}/app-icon-maskable-512.png`,
  fallbackType: "customtabs",
  enableNotifications: false,
  minSdkVersion: 24,
  splashScreenFadeOutDuration: 300,
  appVersion: "1.0.0",
  appVersionCode: 1,
  signingKey: { path: "upload-key.jks", alias: "tuluworld-upload" },
});

try {
  await mkdir(output, { recursive: true });
  await new TwaGenerator().createTwaProject(output, androidManifest, new ConsoleLog());
} finally {
  server.closeAllConnections();
  server.close();
}
console.log(`Generated Android project for ${packageId} targeting ${origin}.`);
