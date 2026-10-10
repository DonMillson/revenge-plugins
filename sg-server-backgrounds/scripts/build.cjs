"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (config.version !== pkg.version) throw new Error("Wersje package.json i config.json muszą być zgodne.");
if (config.targetGuildId && !/^\d{15,22}$/.test(config.targetGuildId)) throw new Error("Niepoprawne ID serwera.");
if (!/^[a-z0-9_-]{1,100}$/.test(config.channelName)) throw new Error("Niepoprawna nazwa kanału.");
if (!(config.refreshMs >= 30000 && config.minFetchMs >= 1000)) throw new Error("Zbyt częste odświeżanie.");
const source = ["core.js", "plugin.js"].map(name => fs.readFileSync(path.join(root, "src", name), "utf8")
    .replace(/^module\.exports = .*;\s*$/m, "")).join("\n");
const bundle = "(() => {\n" + source + "\nreturn createPlugin(vendetta, " + JSON.stringify(config) + ");\n})()\n";
// Revenge's actual compatibility loader places this expression after `return`.
vm.compileFunction("return " + bundle, ["vendetta"]);
const manifest = {
    name: config.name,
    description: "By DonMillson. Wspólne tło za wiadomościami, publikowane przez właściciela w #" + config.channelName + ". Revenge Classic; wersja beta.",
    authors: [{ name: "DonMillson" }],
    main: "index.js",
    version: config.version,
    hash: crypto.createHash("sha256").update(bundle).digest("hex"),
    vendetta: { icon: "ImageIcon" }
};
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "index.js"), bundle);
const manifestText = JSON.stringify(manifest, null, 2) + "\n";
fs.writeFileSync(path.join(root, "dist", "manifest.json"), manifestText);
// The public repository serves these root files directly to Revenge.
fs.writeFileSync(path.join(root, "index.js"), bundle);
fs.writeFileSync(path.join(root, "manifest.json"), manifestText);
fs.writeFileSync(path.join(root, "dist", ".nojekyll"), "");
console.log("Zbudowano " + config.name + " " + config.version + " (" + Buffer.byteLength(bundle) + " bajtów).");
