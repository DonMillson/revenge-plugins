"use strict";
function isSnowflake(value) { return /^\d{15,22}$/.test(String(value || "")); }
function serviceBase(value) {
    const base = String(value || "").replace(/\/$/, "");
    if (!/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::443)?$/.test(base)) throw new Error("Niepoprawny adres usługi tła.");
    return base;
}
function validateManifest(data, guildId, defaults) {
    if (!data || data.schema !== 1 || String(data.guildId) !== String(guildId) || !isSnowflake(guildId) ||
        !/^[a-f0-9]{32}$/.test(data.revision || "") || typeof data.enabled !== "boolean" ||
        !Number.isFinite(Date.parse(data.updatedAt))) throw new Error("Usługa zwróciła niepoprawne ustawienia tła.");
    const result = { schema: 1, guildId: String(guildId), revision: data.revision, enabled: data.enabled, updatedAt: data.updatedAt };
    if (!data.enabled) return result;
    if (data.assetPath !== "/assets/" + guildId + "/" + data.revision ||
        !["image/png", "image/jpeg", "image/webp"].includes(data.mimeType) ||
        !Number.isInteger(data.size) || data.size < 1 || data.size > defaults.maxImageBytes ||
        !Number.isInteger(data.width) || !Number.isInteger(data.height) ||
        data.width < 1 || data.height < 1 || Math.max(data.width, data.height) > defaults.maxImageDimension ||
        !Number.isFinite(data.dim) || data.dim < 0 || data.dim > 0.9 ||
        !Number.isFinite(data.blur) || data.blur < 0 || data.blur > 20) throw new Error("Usługa zwróciła niepoprawną grafikę.");
    return Object.assign(result, {
        assetPath: data.assetPath, mimeType: data.mimeType, size: data.size, width: data.width, height: data.height,
        dim: data.dim, blur: data.blur,
        fileName: String(data.fileName || data.filename || "tlo").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120),
        filename: String(data.fileName || data.filename || "tlo").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120),
        url: serviceBase(defaults.serviceUrl) + data.assetPath
    });
}
function normalizeAsset(asset, defaults) {
    const uri = String(asset?.fileCopyUri || asset?.uri || "");
    if (!/^(?:file|content|ph|assets-library):/.test(uri)) throw new Error("Wybierz plik z telefonu.");
    const name = String(asset.fileName || asset.name || "tlo").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120) || "tlo";
    let type = String(asset.type || "").toLowerCase();
    if (!type || type === "application/octet-stream" || type === "image/*") {
        type = /\.png$/i.test(name) ? "image/png" : /\.jpe?g$/i.test(name) ? "image/jpeg" : /\.webp$/i.test(name) ? "image/webp" : "";
    }
    if (type === "image/jpg") type = "image/jpeg";
    if (!["image/png", "image/jpeg", "image/webp"].includes(type)) throw new Error("Wybierz PNG, JPG lub WEBP.");
    const size = Number(asset.fileSize ?? asset.size ?? 0);
    if (size > defaults.maxImageBytes) throw new Error("Plik może mieć najwyżej 10 MB.");
    if (Math.max(Number(asset.width) || 0, Number(asset.height) || 0) > defaults.maxImageDimension) throw new Error("Grafika może mieć najwyżej 4096 px na bok.");
    const base64 = typeof asset.base64 === "string" ? asset.base64 : "";
    if (base64.length > Math.ceil(defaults.maxImageBytes / 3) * 4) throw new Error("Plik może mieć najwyżej 10 MB.");
    return { uri, name, type, size, base64 };
}
function uploadRequest(asset, dim, blur, key, FormDataType) {
    if (!asset || !asset.uri) throw new Error("Najpierw wybierz grafikę.");
    if (!Number.isFinite(dim) || dim < 0 || dim > 0.9 || !Number.isFinite(blur) || blur < 0 || blur > 20) throw new Error("Sprawdź przyciemnienie (0–0,9) i rozmycie (0–20).");
    const headers = { "X-Owner-Key": key };
    let body;
    if (asset.base64) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({ base64: asset.base64, fileName: asset.name, mimeType: asset.type, dim, blur });
    } else {
        if (!FormDataType) throw new Error("Ta wersja aplikacji nie obsługuje przesyłania plików. Spróbuj wyboru z galerii.");
        body = new FormDataType();
        body.append("image", { uri: asset.uri, name: asset.name, type: asset.type });
        body.append("dim", String(dim));
        body.append("blur", String(blur));
    }
    return { method: "PUT", headers, body };
}
function createController(deps, defaults, settings) {
    const cache = new Map(), states = new Map(), requests = new Map(), epochs = new Map();
    let active = false, generation = 0;
    const now = deps.now || Date.now;
    const changed = () => deps.changed?.();
    const base = serviceBase(defaults.serviceUrl);
    function context(guildId) {
        if (!isSnowflake(guildId)) return null;
        const guild = deps.getGuild(guildId);
        const ownerId = String(guild?.ownerId || guild?.owner_id || "");
        return guild ? { guildId: String(guildId), ownerId } : null;
    }
    function contextProblem(guildId) {
        if (settings.enabled === false) return "Tło jest wyłączone na tym telefonie.";
        if (!isSnowflake(guildId)) return "Otwórz kanał na swoim serwerze.";
        if (settings.targetGuildId && String(settings.targetGuildId) !== String(guildId)) return "W ustawieniach wybrano inny serwer.";
        if (!context(guildId)) return "Serwer nie jest jeszcze wczytany.";
        return "";
    }
    function persist() {
        const entries = Array.from(cache.entries()).slice(-20);
        settings.sharedThemes = Object.fromEntries(entries);
    }
    function accept(guildId, data) {
        const theme = validateManifest(data, guildId, defaults);
        const old = cache.get(guildId);
        if (old && Date.parse(old.updatedAt) > Date.parse(theme.updatedAt)) return old;
        cache.set(guildId, theme); persist();
        states.set(guildId, { last: now(), failures: 0, next: 0, text: theme.enabled ? "Wspólne tło: " + theme.filename : "Właściciel wyłączył wspólne tło." });
        changed(); return theme;
    }
    return {
        start() {
            active = true; generation++;
            for (const [id, data] of Object.entries(settings.sharedThemes || {}).slice(-20)) {
                try { cache.set(id, validateManifest(data, id, defaults)); } catch (_) {}
            }
        },
        stop() { active = false; generation++; requests.clear(); },
        changed,
        context, contextProblem,
        status(guildId) { return states.get(guildId)?.text || (cache.get(guildId)?.enabled ? "Wspólne tło zapisane w pamięci; sprawdzam aktualizację." : "Nie ustawiono wspólnego tła."); },
        snapshot(guildId) {
            if (!active || contextProblem(guildId)) return null;
            const theme = cache.get(guildId);
            if (!theme?.enabled) return null;
            const localDim = settings.localDim;
            return localDim != null && Number.isFinite(localDim) ? Object.assign({}, theme, { dim: Math.max(0, Math.min(0.9, localDim)) }) : theme;
        },
        publish(guildId, data) {
            if (!active) return null;
            epochs.set(guildId, (epochs.get(guildId) || 0) + 1);
            return accept(guildId, data);
        },
        imageError(guildId) { const state = states.get(guildId) || {}; states.set(guildId, { ...state, text: "Nie udało się wczytać obrazu. Odśwież tło i skopiuj diagnostykę." }); changed(); },
        sync(guildId, force) {
            if (!active || contextProblem(guildId)) return Promise.resolve(null);
            if (requests.has(guildId)) return requests.get(guildId);
            const state = states.get(guildId) || { last: -Infinity, next: 0, failures: 0 };
            if (now() < state.next || (!force && now() - state.last < defaults.minFetchMs)) return Promise.resolve(cache.get(guildId));
            const version = generation, epoch = epochs.get(guildId) || 0;
            state.last = now(); state.text = "Sprawdzam wspólne tło…"; states.set(guildId, state); changed();
            const request = Promise.resolve().then(() => deps.getManifest(base + "/api/guilds/" + guildId)).then(data => {
                if (!active || generation !== version || (epochs.get(guildId) || 0) !== epoch) return null;
                if (!data) { cache.delete(guildId); persist(); states.set(guildId, { last: now(), failures: 0, next: 0, text: "Nie ustawiono wspólnego tła. Właściciel może wybrać plik w ustawieniach." }); changed(); return null; }
                return accept(guildId, data);
            }).catch(error => {
                if (!active || generation !== version || (epochs.get(guildId) || 0) !== epoch) return null;
                const failures = state.failures + 1;
                const retry = Number(error?.retryMs) || Math.min(300000, 15000 * 2 ** Math.min(failures - 1, 4));
                states.set(guildId, { last: now(), failures, next: now() + retry, text: Number(error?.status) === 429 ? "Usługa ograniczyła odświeżanie. Ponowię automatycznie." : "Nie udało się pobrać wspólnego tła. Sprawdź połączenie i odśwież." }); changed(); return null;
            }).finally(() => { if (requests.get(guildId) === request) requests.delete(guildId); });
            requests.set(guildId, request); return request;
        }
    };
}
module.exports = { isSnowflake, serviceBase, validateManifest, normalizeAsset, uploadRequest, createController };
