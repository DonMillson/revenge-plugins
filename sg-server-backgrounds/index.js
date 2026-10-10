(() => {
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

"use strict";

function createPlugin(api, defaults) {
    let React, RN, controller, stores = {}, dispatcher;
    let active = false;
    let chatPatched = false;
    let renderEnabled = false;
    let compatibility = "Dodatek nie jest uruchomiony.";
    const viewState = { channelId: "", imageKey: "", image: "Obraz nie został jeszcze przekazany do widoku czatu.", surfaceCount: 0 };
    const cleanup = [];
    const requests = new Set();
    const listeners = new Set();
    const timers = new Set();
    const brokenImages = new Set();
    const settings = api?.plugin?.storage || {};
    if (settings.enabled === undefined) settings.enabled = true;
    function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }
    function notify() { listeners.forEach(fn => safe(fn)); }
    function later(fn, ms) {
        const timer = setTimeout(() => { timers.delete(timer); if (active) fn(); }, ms);
        timers.add(timer);
        return timer;
    }
    function selectedChannelId() { return safe(() => String(stores.selected?.getChannelId?.() || ""), ""); }
    function getChannel(id) { return safe(() => stores.channels?.getChannel?.(id), null); }
    function guildForChannel(id) {
        const channel = getChannel(id);
        return String(channel?.guild_id || channel?.guildId || "");
    }
    function currentGuildId() {
        const id = guildForChannel(selectedChannelId());
        if (isSnowflake(id)) settings.lastGuildId = id;
        const selectedGuild = safe(() => String(stores.selectedGuild?.getGuildId?.() || ""), "");
        return id || (isSnowflake(selectedGuild) ? selectedGuild : "") || settings.targetGuildId || defaults.targetGuildId || settings.lastGuildId || "";
    }
    async function requestService(path, options) {
        if (typeof fetch !== "function") throw new Error("Brak obsługi połączenia z usługą tła.");
        const abort = typeof AbortController === "function" ? new AbortController() : null;
        if (abort) requests.add(abort);
        const timer = setTimeout(() => abort?.abort(), options?.method && options.method !== "GET" ? 45000 : 15000);
        timers.add(timer);
        try {
            const response = await fetch(serviceBase(defaults.serviceUrl) + path, Object.assign({ cache: "no-store" }, options, abort ? { signal: abort.signal } : {}));
            if (response.status === 404 && !options?.method) return null;
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                const error = new Error(data?.error || "Nie udało się połączyć z usługą tła.");
                error.status = response.status;
                const retry = Number(response.headers?.get?.("retry-after") || 0);
                if (retry > 0) error.retryMs = Math.min(300000, retry * 1000);
                throw error;
            }
            return data;
        } finally { clearTimeout(timer); timers.delete(timer); if (abort) requests.delete(abort); }
    }
    async function pickFile() {
        const picker = safe(() => api.metro.findByProps("pickSingle", "isCancel"), null);
        if (!picker?.pickSingle) throw new Error("Systemowy wybór plików jest niedostępny w tej wersji aplikacji. Spróbuj galerii.");
        try {
            const asset = await picker.pickSingle({ type: picker.types?.images || "image/*", mode: "import", copyTo: "documentDirectory" });
            return asset ? normalizeAsset(Array.isArray(asset) ? asset[0] : asset, defaults) : null;
        } catch (error) { if (picker.isCancel?.(error)) return null; throw error; }
    }
    async function pickGallery() {
        const picker = safe(() => api.metro.findByProps("launchImageLibrary"), null);
        if (!picker?.launchImageLibrary) return pickFile();
        const result = await new Promise((resolve, reject) => {
            let returned;
            try { returned = picker.launchImageLibrary({ mediaType: "photo", selectionLimit: 1, includeBase64: true, maxWidth: 4096, maxHeight: 4096, quality: 0.95, assetRepresentationMode: "current" }, resolve); }
            catch (error) { reject(error); return; }
            if (returned?.then) returned.then(resolve, reject);
        });
        if (result?.didCancel) return null;
        if (result?.errorCode) throw new Error(result.errorMessage || "Nie udało się otworzyć galerii.");
        const asset = result?.assets?.[0];
        return asset ? normalizeAsset(asset, defaults) : null;
    }
    function ownerFor(guildId) {
        const guild = safe(() => stores.guilds?.getGuild?.(guildId), null);
        const owner = String(guild?.ownerId || guild?.owner_id || "");
        const user = safe(() => String(stores.users?.getCurrentUser?.()?.id || ""), "");
        return Boolean(owner && user && owner === user);
    }
    function transparentTree(node, depth, budget) {
        if (!node || depth > 10 || budget.count++ > 160) return node;
        if (Array.isArray(node)) return node.map(child => transparentTree(child, depth + 1, budget));
        if (!React.isValidElement(node)) return node;
        const props = node.props || {};
        const patch = {};
        let changed = false;
        if ((depth === 0 && props.style !== undefined) || Object.prototype.hasOwnProperty.call(props, "HACK_fixModalInteraction")) {
            if (Object.prototype.hasOwnProperty.call(props, "HACK_fixModalInteraction")) budget.surfaceCount++;
            patch.style = [props.style, { backgroundColor: "transparent" }];
            changed = true;
        }
        if (props.children !== undefined) {
            const children = transparentTree(props.children, depth + 1, budget);
            if (children !== props.children) { patch.children = children; changed = true; }
        }
        return changed ? React.cloneElement(node, patch) : node;
    }
    function useUpdates() {
        const pair = React.useState(0);
        React.useEffect(() => {
            const listener = () => pair[1](x => x + 1);
            listeners.add(listener);
            return () => listeners.delete(listener);
        }, []);
    }
    function Background(props) {
        useUpdates();
        const guildId = guildForChannel(props.channelId);
        React.useEffect(() => { if (active && guildId) void controller?.sync(guildId, false); }, [guildId]);
        const theme = controller?.snapshot(guildId);
        if (!active || !renderEnabled || !theme || brokenImages.has(theme.url)) return props.original;
        const imageKey = theme.revision + theme.url;
        if (viewState.imageKey !== imageKey) {
            viewState.imageKey = imageKey;
            viewState.image = "Wczytuję obraz: " + theme.filename;
        }
        const budget = { count: 0, surfaceCount: 0 };
        const original = transparentTree(props.original, 0, budget);
        viewState.surfaceCount = budget.surfaceCount;
        const fill = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 };
        return React.createElement(RN.View, { style: { flex: 1, height: "100%" }, collapsable: false },
            React.createElement(RN.Image, {
                key: imageKey,
                source: { uri: theme.url }, resizeMode: "cover", blurRadius: theme.blur,
                style: fill, pointerEvents: "none", accessible: false,
                onLoad() { if (active && viewState.imageKey === imageKey) { viewState.image = "Obraz wczytany: " + theme.filename; notify(); } },
                onError() { if (!active) return; brokenImages.add(theme.url); if (viewState.imageKey === imageKey) viewState.image = "Błąd wczytania obrazu: " + theme.filename; controller.imageError(guildId); notify(); }
            }),
            React.createElement(RN.View, {
                pointerEvents: "none", accessible: false,
                style: [fill, { backgroundColor: "rgba(0,0,0," + theme.dim + ")" }]
            }),
            React.createElement(RN.View, { style: { flex: 1, backgroundColor: "transparent" } },
                original)
        );
    }
    let Boundary;
    function channelIdFrom(props) {
        const explicit = props?.channelId || props?.channel_id || props?.channel?.id;
        // An explicit DM must never inherit a currently selected guild's wallpaper.
        return explicit ? String(explicit) : selectedChannelId();
    }
    function installChatPatch() {
        if (chatPatched || !active || !React || !RN) return chatPatched;
        const metro = api.metro;
        const candidates = [];
        for (const name of ["MessagesConnected", "Messages"]) {
            for (const finder of ["findByDisplayName", "findByTypeName", "findByName"]) {
                const value = safe(() => metro[finder]?.(name), null);
                if (value) candidates.push({ value, name });
                const module = safe(() => metro[finder]?.(name, false), null);
                if (module) candidates.push({ value: module.default || module[name] || module, name });
            }
        }
        for (const candidate of candidates) {
            const value = candidate.value;
            const targets = [value, value?.type, value?.prototype];
            for (const target of targets) {
                if (!target || typeof target.render !== "function") continue;
                const unpatch = safe(() => api.patcher.after("render", target, (args, original) => {
                    if (!active || !original) return original;
                    try {
                        const channelId = channelIdFrom(args[0]);
                        viewState.channelId = channelId;
                        const child = React.createElement(Background, { channelId, original });
                        return React.createElement(Boundary, { key: channelId, original }, child);
                    } catch (_) { return original; }
                }), null);
                if (!unpatch) continue;
                cleanup.push(unpatch);
                chatPatched = true;
                renderEnabled = true;
                compatibility = "Wykryto widok czatu: " + candidate.name + ".";
                notify();
                return true;
            }
        }
        compatibility = "Nie wykryto zgodnego widoku czatu. Otwórz kanał i sprawdź ponownie; potrzebny może być port do Twojej wersji Discorda.";
        notify();
        return false;
    }
    function refresh(force) {
        if (!active) return Promise.resolve();
        if (!controller && !initialize()) { notify(); return Promise.resolve(); }
        installChatPatch();
        const guildId = currentGuildId();
        if (!guildId) { notify(); return Promise.resolve(); }
        if (force) brokenImages.clear();
        notify();
        return controller.sync(guildId, force);
    }
    function diagnosticText() {
        const info = safe(() => api.debug?.getDebugInfo?.(), null);
        const guildId = currentGuildId();
        const status = controller ? controller.contextProblem(guildId) || controller.status(guildId) : "Synchronizacja nie jest uruchomiona.";
        return [
            "SG Server Backgrounds " + defaults.version + " — By DonMillson",
            "Discord: " + (info?.discord?.version || "brak danych") + " (build " + (info?.discord?.build || "?") + ")",
            "Revenge: " + (info?.bunny?.version || info?.vendetta?.version || api.version || "brak danych"),
            compatibility,
            "Serwer: " + (safe(() => stores.guilds?.getGuild?.(guildId)?.name, "") || (guildId ? "wykryty" : "niewykryty")),
            "Właściciel serwera: " + (ownerFor(guildId) ? "tak" : "nie lub brak danych"),
            "Synchronizacja: " + status,
            "Klucz publikowania: " + (settings.ownerKey ? "zapisany na tym telefonie" : "niewpisany; wymagany tylko do zapisu"),
            "Widok wiadomości po włączeniu: " + (viewState.channelId ? "wykryty" : "jeszcze niewykryty"),
            viewState.image,
            "Kontener listy wiadomości: " + (viewState.surfaceCount ? "wykryty" : "niewykryty")
        ].join("\n");
    }
    function Settings() {
        if (!React || !RN) return null;
        useUpdates();
        const [targetDraft, setTargetDraft] = React.useState(settings.targetGuildId || currentGuildId() || "");
        const [keyDraft, setKeyDraft] = React.useState(settings.ownerKey || "");
        const [asset, setAsset] = React.useState(null);
        const [dimDraft, setDimDraft] = React.useState(String(defaults.dim));
        const [blurDraft, setBlurDraft] = React.useState(String(defaults.blur));
        const [feedback, setFeedback] = React.useState("");
        const [busy, setBusy] = React.useState(false);
        const guildId = targetDraft.trim();
        const isOwner = ownerFor(guildId);
        const theme = controller?.snapshot(guildId);
        const textStyle = { color: "#f3f4f7", fontSize: 16, marginBottom: 10 };
        const inputStyle = { color: "#ffffff", backgroundColor: "#232630", borderRadius: 9, padding: 12, marginBottom: 16, fontSize: 16 };
        const el = React.createElement;
        const text = (value, extra) => el(RN.Text, { style: Object.assign({}, textStyle, extra) }, value);
        const input = (value, onChangeText, placeholder, numeric, secret) => el(RN.TextInput, {
            value, onChangeText, placeholder, placeholderTextColor: "#a0a6b6", style: inputStyle,
            autoCapitalize: "none", autoCorrect: false, keyboardType: numeric ? "decimal-pad" : "default", secureTextEntry: Boolean(secret)
        });
        const button = (label, fn) => el(RN.TouchableOpacity, {
            accessibilityRole: "button", onPress: fn, disabled: busy,
            style: { backgroundColor: busy ? "#5a3548" : "#c83c76", borderRadius: 9, padding: 13, marginBottom: 12 }
        }, text(label, { marginBottom: 0, textAlign: "center", fontWeight: "700" }));
        async function choose(picker) {
            if (busy) return;
            setBusy(true);
            try {
                const selected = await picker();
                if (!active) return;
                if (selected) { setAsset(selected); setFeedback("Wybrano: " + selected.name + ". Kliknij Zapisz dla wszystkich."); }
            } catch (error) { if (active) setFeedback(error.message || "Nie udało się wybrać grafiki."); }
            finally { if (active) setBusy(false); }
        }
        async function publish(remove) {
            if (busy) return;
            if (!isSnowflake(guildId)) return setFeedback("Najpierw wybierz serwer.");
            if (!ownerFor(guildId)) return setFeedback("Wspólne tło zapisuje właściciel wybranego serwera.");
            const key = keyDraft.trim();
            if (!/^sg_[a-f0-9]{64}$/.test(key)) return setFeedback("Wklej prywatny klucz właściciela z otrzymanego pliku.");
            if (!remove && !asset) return setFeedback("Najpierw wybierz grafikę z galerii lub plików.");
            const dim = Number(dimDraft.replace(",", ".")), blur = Number(blurDraft.replace(",", "."));
            setBusy(true); setFeedback(remove ? "Wyłączam wspólne tło…" : "Wysyłam grafikę i zapisuję dla wszystkich…");
            try {
                const options = remove ? { method: "DELETE", headers: { "X-Owner-Key": key } } : uploadRequest(asset, dim, blur, key, typeof FormData === "function" ? FormData : null);
                const data = await requestService("/api/guilds/" + guildId, options);
                if (!active) return;
                // Validate the service response before claiming the shared save succeeded.
                validateManifest(data, guildId, defaults);
                settings.ownerKey = key;
                settings.targetGuildId = guildId;
                settings.enabled = true;
                brokenImages.clear();
                controller?.publish(guildId, data);
                setAsset(null);
                setFeedback(remove ? "Wyłączono wspólne tło. Członkowie z pluginem zobaczą zmianę po odświeżeniu." : "Zapisano wspólne tło wszystkich kanałów tego serwera. Członkowie z pluginem pobiorą je w ciągu około 30 sekund przy otwartej aplikacji.");
            } catch (error) { if (active) setFeedback(error.name === "AbortError" ? "Wysyłanie trwało zbyt długo. Spróbuj ponownie." : error.message || "Nie udało się zapisać wspólnego tła."); }
            finally { if (active) setBusy(false); }
        }
        return el(RN.ScrollView, { style: { flex: 1, backgroundColor: "#13151b" }, contentContainerStyle: { padding: 20, paddingBottom: 60 } },
            text(defaults.name, { fontSize: 24, fontWeight: "800" }),
            text("By DonMillson", { fontSize: 16, fontWeight: "700", color: "#ec72a3" }),
            text("Ten sam obraz za wiadomościami na wszystkich kanałach wybranego serwera."),
            el(RN.View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
                text("Pokaż tło na tym telefonie", { marginBottom: 0 }),
                el(RN.Switch, { value: settings.enabled !== false, onValueChange: value => { settings.enabled = value; controller?.changed(); if (value) void refresh(true); } })
            ),
            text("Serwer"), input(targetDraft, setTargetDraft, "ID serwera", true),
            button("Użyj obecnie otwartego serwera", () => { const id = currentGuildId(); if (id) setTargetDraft(id); else setFeedback("Najpierw otwórz kanał na serwerze."); }),
            button("Zapisz wybór serwera", () => {
                if (guildId && !isSnowflake(guildId)) return setFeedback("ID serwera musi być numerem skopiowanym z Discorda.");
                settings.targetGuildId = guildId; controller?.changed(); setFeedback("Zapisano wybór serwera."); void refresh(true);
            }),
            text(isOwner ? "Ustaw wspólne tło" : "Wspólne tło wybiera właściciel serwera.", { fontSize: 20, fontWeight: "700", marginTop: 12 }),
            isOwner ? el(RN.View, null,
                text("Klucz właściciela (wklej tylko na swoim telefonie)"),
                input(keyDraft, setKeyDraft, "Prywatny klucz sg_…", false, true),
                button("Zapisz klucz na tym telefonie", () => { const key = keyDraft.trim(); if (!/^sg_[a-f0-9]{64}$/.test(key)) return setFeedback("Sprawdź klucz właściciela."); settings.ownerKey = key; setFeedback("Zapisano klucz właściciela."); }),
                button("Wybierz grafikę z galerii", () => { void choose(pickGallery); }),
                button("Wybierz grafikę z plików", () => { void choose(pickFile); }),
                asset || theme ? el(RN.Image, { source: { uri: asset?.uri || theme.url }, resizeMode: "contain", style: { height: 260, borderRadius: 10, marginBottom: 12 }, accessibilityLabel: "Podgląd tła" }) : null,
                asset ? text("Wybrany plik: " + asset.name) : null,
                text("Przyciemnienie: 0–0,9"), input(dimDraft, setDimDraft, "0.45", true),
                text("Rozmycie: 0–20"), input(blurDraft, setBlurDraft, "0", true),
                button("Zapisz dla wszystkich", () => { void publish(false); }),
                button("Wyłącz wspólne tło", () => { void publish(true); }),
                text("PNG, JPG lub WEBP; do 10 MB i 4096 px na bok. Grafika trafia do wspólnej usługi i jest dostępna przez publiczny adres.", { fontSize: 14, color: "#bbc1d0" })
            ) : null,
            button("Odśwież tło", () => { void refresh(true); }),
            feedback ? text(feedback, { color: "#86e5ad" }) : null,
            text("Diagnostyka", { fontSize: 20, fontWeight: "700", marginTop: 12 }),
            text(diagnosticText(), { fontSize: 14, selectable: true }),
            button("Kopiuj diagnostykę", () => {
                const clipboard = safe(() => api.metro.common.clipboard, null);
                if (!clipboard?.setString) return setFeedback("Zrób zrzut ekranu powyższej diagnostyki.");
                try { Promise.resolve(clipboard.setString(diagnosticText())).then(() => setFeedback("Skopiowano diagnostykę."), () => setFeedback("Zrób zrzut ekranu powyższej diagnostyki.")); }
                catch (_) { setFeedback("Zrób zrzut ekranu powyższej diagnostyki."); }
            }),
            text("Każdy członek potrzebuje Revenge Classic i tego pluginu. Klucz właściciela jest potrzebny tylko do zapisu. Członkowie pobierają tło automatycznie, bez wybierania własnego pliku.", { fontSize: 14, color: "#bbc1d0" }),
            text("Tło nie dotyczy wiadomości prywatnych. Wersja beta: widoczność obrazu wymaga sprawdzenia na Twojej wersji Discorda.", { fontSize: 14, color: "#bbc1d0" })
        );
    }
    function initialize() {
        if (!active || controller) return Boolean(controller);
        React = safe(() => api.metro.common.React);
        RN = safe(() => api.metro.common.ReactNative);
        if (!React?.createElement || !React?.Component || !RN?.Image || !RN?.View) {
            compatibility = "Brak zgodnego API React Native. Użyj Revenge Classic."; return false;
        }
        Boundary = class extends React.Component {
            constructor(props) { super(props); this.state = { failed: false }; }
            static getDerivedStateFromError() { return { failed: true }; }
            componentDidCatch() { renderEnabled = false; compatibility = "Tło zostało wyłączone po błędzie wyświetlania. Skopiuj diagnostykę."; notify(); }
            render() { return this.state.failed ? this.props.original : this.props.children; }
        };
        function store(name) { return safe(() => api.metro.findByStoreName(name), null); }
        stores = { selected: store("SelectedChannelStore"), channels: store("ChannelStore"), guilds: store("GuildStore"), selectedGuild: store("SelectedGuildStore"), users: store("UserStore") };
        dispatcher = safe(() => api.metro.common.FluxDispatcher, null);
        if (!stores.channels?.getChannel || !stores.guilds?.getGuild || !stores.selected?.getChannelId || typeof fetch !== "function") {
            compatibility = "Nie znaleziono API kanałów, serwerów lub połączenia. Otwórz kanał i kliknij Odśwież."; notify(); return false;
        }
        controller = createController({
            getGuild: id => stores.guilds.getGuild(id), changed: notify,
            getManifest: url => requestService(url.slice(serviceBase(defaults.serviceUrl).length))
        }, defaults, settings);
        controller.start(); installChatPatch();
        if (dispatcher?.subscribe && dispatcher?.unsubscribe) {
            for (const name of ["CHANNEL_SELECT", "GUILD_UPDATE", "CONNECTION_OPEN"]) {
                const callback = () => later(() => { void refresh(false); }, 0);
                const subscribed = safe(() => { dispatcher.subscribe(name, callback); return true; }, false);
                if (subscribed) cleanup.push(() => dispatcher.unsubscribe(name, callback));
            }
        }
        const appSubscription = safe(() => RN.AppState?.addEventListener?.("change", state => { if (state === "active") void refresh(false); }), null);
        if (appSubscription?.remove) cleanup.push(() => appSubscription.remove());
        const interval = setInterval(() => { if (active && (!RN.AppState || RN.AppState.currentState === "active")) void refresh(false); }, defaults.refreshMs);
        cleanup.push(() => clearInterval(interval));
        let attempts = 0;
        function retryPatch() { if (!active || chatPatched || attempts++ >= 12) return; installChatPatch(); if (!chatPatched) later(retryPatch, 5000); }
        if (!chatPatched) later(retryPatch, 5000);
        void refresh(false); return true;
    }
    return {
        onLoad() {
            active = true;
            let attempts = 0;
            function retryInitialize() {
                if (!active || controller || attempts++ >= 12) return;
                if (!initialize()) later(retryInitialize, 3000);
            }
            retryInitialize();
        },
        onUnload() {
            active = false;
            renderEnabled = false;
            requests.forEach(request => safe(() => request.abort()));
            requests.clear();
            controller?.stop();
            controller = null;
            timers.forEach(timer => clearTimeout(timer));
            timers.clear();
            cleanup.splice(0).reverse().forEach(fn => safe(fn));
            chatPatched = false;
            brokenImages.clear();
            Object.assign(viewState, { channelId: "", imageKey: "", image: "Obraz nie został jeszcze przekazany do widoku czatu.", surfaceCount: 0 });
            compatibility = "Dodatek nie jest uruchomiony.";
            notify();
        },
        settings: Settings
    };
}

// Node exports are removed from the installable bundle by the build script.

return createPlugin(vendetta, {"name":"SG Server Backgrounds","version":"0.2.0-beta.1","targetGuildId":"","serviceUrl":"https://donmillson-sg-background-sync.valid-eagle-2253.chatgpt.site","dim":0.45,"blur":0,"refreshMs":30000,"minFetchMs":15000,"maxImageBytes":10485760,"maxImageDimension":4096});
})()
