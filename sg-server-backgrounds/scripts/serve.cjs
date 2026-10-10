"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const port = Number(process.env.SG_BACKGROUND_PORT || 8080);
const dist = path.resolve(__dirname, "../dist");
http.createServer((request, response) => {
    const name = request.url.split("?")[0];
    const file = name === "/manifest.json" ? "manifest.json" : name === "/index.js" ? "index.js" : null;
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "no-store");
    if (!file || request.method !== "GET") { response.writeHead(404); response.end("Not found"); return; }
    fs.readFile(path.join(dist, file), (error, bytes) => {
        if (error) { response.writeHead(404); response.end("Build first: npm run build"); return; }
        response.setHeader("Content-Type", file.endsWith(".json") ? "application/json; charset=utf-8" : "text/javascript; charset=utf-8");
        response.end(bytes);
    });
}).listen(port, "0.0.0.0", () => {
    console.log("Test lokalny. Telefon i komputer muszą być w tej samej sieci Wi-Fi.");
    for (const entries of Object.values(os.networkInterfaces())) for (const entry of entries || []) {
        if (entry.family === "IPv4" && !entry.internal) console.log("Link instalacji: http://" + entry.address + ":" + port + "/");
    }
});
