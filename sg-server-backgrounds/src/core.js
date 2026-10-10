"use strict";

function clampNumber(value, fallback, min, max) {
    if (value === null || value === undefined || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function compareIds(a, b) {
    a = String(a || "");
    b = String(b || "");
    return a.length === b.length ? (a === b ? 0 : a > b ? 1 : -1) : a.length > b.length ? 1 : -1;
}

function safeImageUrl(value) {
    if (typeof value !== "string" || value.length > 4096) return null;
    // Hermes versions differ in their URL implementation. No global URL dependency.
    const match = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)(\/attachments\/[^\s?#]+)(\?[^\s#]*)?$/i.exec(value);
    if (!match || /(?:^|[\/\\])\.\.(?:[\/\\]|$)/.test(match[2])) return null;
    return value;
}

function isSnowflake(value) {
    return typeof value === "string" && /^\d{15,22}$/.test(value);
}

function parseThemeMessage(message, ownerId, defaults) {
    if (!message || !ownerId || String(message.author?.id || "") !== String(ownerId)) return null;
    if (message.webhook_id || message.author?.bot || !isSnowflake(String(message.id || ""))) return null;
    const content = String(message.content || "").trim();
    const normalized = content.toLowerCase().replace(/ł/g, "l").replace(/ó/g, "o").replace(/ą/g, "a");
    if (/^!?tlo\s+(off|wylacz)$/.test(normalized)) {
        return { messageId: String(message.id), ownerId: String(ownerId), enabled: false };
    }
    const hasOptions = /^!?tlo(?:\s|$)/i.test(normalized);
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    const attachment = attachments.find(a => {
        const mime = a?.content_type || a?.contentType || "";
        return /\.(png|jpe?g|webp)$/i.test(String(a?.filename || "")) &&
            (!mime || /^image\/(png|jpeg|webp)$/i.test(mime)) &&
            Number(a?.size || 0) <= defaults.maxImageBytes &&
            Number(a?.width || 0) <= defaults.maxImageDimension &&
            Number(a?.height || 0) <= defaults.maxImageDimension &&
            safeImageUrl(a?.url);
    });
    if (!attachment) return null;
    const options = {};
    const optionPattern = /\b(dim|blur)\s*=\s*([0-9]+(?:[.,][0-9]+)?)/g;
    let match;
    while (hasOptions && (match = optionPattern.exec(normalized))) {
        options[match[1]] = match[2].replace(",", ".");
    }
    return {
        messageId: String(message.id),
        ownerId: String(ownerId),
        enabled: true,
        url: safeImageUrl(attachment.url),
        dim: clampNumber(options.dim, defaults.dim, 0, 0.9),
        blur: clampNumber(options.blur, defaults.blur, 0, 20),
        filename: String(attachment.filename)
    };
}

function latestTheme(messages, ownerId, defaults) {
    return messages.map(m => parseThemeMessage(m, ownerId, defaults)).filter(Boolean)
        .sort((a, b) => -compareIds(a.messageId, b.messageId))[0] || null;
}

function findThemeChannel(channels, guildId, name) {
    const matches = channels.filter(c => c && String(c.guild_id || c.guildId || "") === String(guildId) &&
        c.type === 0 && c.name === name);
    // Duplicate names need an explicit resolution; do not arbitrarily trust the first channel.
    return matches.length === 1 ? matches[0] : null;
}

function retryDelay(error) {
    const seconds = error?.body?.retry_after ?? error?.response?.body?.retry_after ?? 5;
    return clampNumber(seconds, 5, 1, 3600) * 1000;
}

function createController(adapter, defaults, settings) {
    const statuses = Object.create(null);
    const inFlight = new Map();
    const fetchedAt = new Map();
    const revisions = new Map();
    let running = false;
    let generation = 0;
    let requestAfter = 0;
    if (!settings.cache || typeof settings.cache !== "object") settings.cache = {};
    const clock = adapter.now || Date.now;
    const notify = () => { try { adapter.changed(); } catch (_) {} };
    function status(guildId, text) {
        if (statuses[guildId] === text) return;
        statuses[guildId] = text;
        notify();
    }
    function resolveContext(guildId) {
        const fail = problem => ({ context: null, problem });
        if (!running) return fail("Dodatek nie jest uruchomiony.");
        if (settings.enabled === false) return fail("Tło jest wyłączone w ustawieniach pluginu.");
        if (!isSnowflake(String(guildId || ""))) return fail("Najpierw otwórz kanał tekstowy na swoim serwerze.");
        const target = settings.targetGuildId || defaults.targetGuildId;
        if (target && target !== String(guildId)) return fail("Otwarty serwer różni się od ID zapisanego w ustawieniach pluginu.");
        let guild, channels;
        try { guild = adapter.getGuild(guildId); channels = adapter.getChannels(guildId); } catch (_) { return fail("Nie udało się odczytać danych serwera lub jego kanałów."); }
        if (!guild) return fail("Nie odczytano danych serwera. Otwórz jego kanał i odśwież tło.");
        const ownerId = String(guild?.ownerId || guild?.owner_id || "");
        if (!isSnowflake(ownerId)) return fail("Nie odczytano właściciela serwera. Otwórz jego kanał i odśwież tło.");
        const name = settings.channelName || defaults.channelName;
        const matching = (channels || []).filter(c => c && String(c.guild_id || c.guildId || "") === String(guildId) && c.type === 0 && c.name === name);
        if (!matching.length) return fail("Nie znaleziono zwykłego kanału tekstowego #" + name + ". Sprawdź nazwę i dostęp do kanału.");
        if (matching.length > 1) return fail("Znaleziono kilka kanałów #" + name + ". Pozostaw jeden kanał o tej nazwie.");
        const channel = matching[0];
        if (!isSnowflake(String(channel.id))) return fail("Nie odczytano ID kanału tła.");
        return { context: { guildId: String(guildId), ownerId, channelId: String(channel.id) }, problem: null };
    }
    function context(guildId) {
        return resolveContext(guildId).context;
    }
    function sameContext(a, b) {
        return a && b && a.guildId === b.guildId && a.ownerId === b.ownerId && a.channelId === b.channelId;
    }
    function snapshot(guildId) {
        const ctx = context(guildId);
        const theme = settings.cache[guildId];
        if (!ctx || !theme || theme.ownerId !== ctx.ownerId || theme.channelId !== ctx.channelId) return null;
        if (!isSnowflake(theme.messageId)) return null;
        if (theme.enabled !== true || !safeImageUrl(theme.url)) return null;
        return Object.assign({}, theme, {
            dim: clampNumber(settings.localDim, clampNumber(theme.dim, defaults.dim, 0, 0.9), 0, 0.9),
            blur: clampNumber(theme.blur, defaults.blur, 0, 20)
        });
    }
    function accept(ctx, messages, authoritative) {
        if (!sameContext(ctx, context(ctx.guildId))) return;
        const theme = latestTheme(messages, ctx.ownerId, defaults);
        const previous = settings.cache[ctx.guildId];
        if (!authoritative && (!theme || previous && compareIds(theme.messageId, previous.messageId) < 0)) return;
        if (!theme) {
            delete settings.cache[ctx.guildId];
            status(ctx.guildId, "Brak grafiki właściciela w #" + (settings.channelName || defaults.channelName) + ".");
        } else {
            settings.cache[ctx.guildId] = Object.assign({}, theme, { channelId: ctx.channelId });
            status(ctx.guildId, theme.enabled ? "Tło: " + theme.filename : "Właściciel wyłączył tło.");
        }
        notify();
    }
    async function sync(guildId, force) {
        const resolved = resolveContext(guildId);
        const ctx = resolved.context;
        if (!ctx) {
            if (running) status(guildId || "", resolved.problem);
            return;
        }
        if (inFlight.has(ctx.guildId)) return inFlight.get(ctx.guildId);
        if (clock() < requestAfter) return;
        if (!force && fetchedAt.has(ctx.guildId) && clock() - fetchedAt.get(ctx.guildId) < defaults.minFetchMs) return;
        const ownGeneration = generation;
        const ownRevision = revisions.get(ctx.guildId) || 0;
        let superseded = false;
        try {
            const loaded = !force && adapter.getLoadedMessages?.(ctx.channelId);
            if (Array.isArray(loaded)) accept(ctx, loaded, false);
        } catch (_) {}
        status(ctx.guildId, "Sprawdzam grafikę właściciela…");
        fetchedAt.set(ctx.guildId, clock());
        const work = Promise.resolve().then(() => adapter.getMessages(ctx.channelId)).then(messages => {
            if (!running || generation !== ownGeneration || !sameContext(ctx, context(ctx.guildId))) return;
            if ((revisions.get(ctx.guildId) || 0) !== ownRevision) { superseded = true; return; }
            if (!Array.isArray(messages)) throw new Error("Niepoprawna odpowiedź listy wiadomości.");
            accept(ctx, messages, true);
        }).catch(error => {
            if (!running || generation !== ownGeneration) return;
            const code = Number(error?.status || error?.response?.status || error?.body?.status || 0);
            if (code === 429) {
                requestAfter = clock() + retryDelay(error);
                status(ctx.guildId, "Limit odczytów. Spróbuj ponownie za chwilę.");
            } else if (code === 403 || code === 404) {
                delete settings.cache[ctx.guildId];
                status(ctx.guildId, "Brak dostępu do kanału tła lub historii wiadomości.");
            } else {
                status(ctx.guildId, "Nie udało się odświeżyć tła. Sprawdź połączenie i użyj Odśwież.");
            }
        }).finally(() => {
            if (inFlight.get(ctx.guildId) === work) inFlight.delete(ctx.guildId);
            if (superseded && running && generation === ownGeneration) void sync(ctx.guildId, true);
        });
        inFlight.set(ctx.guildId, work);
        return work;
    }
    function event(action) {
        if (!running || !action) return;
        const channelId = String(action.channelId || action.channel_id || action.message?.channel_id || action.message?.channelId || "");
        let channel;
        try { channel = adapter.getChannel(channelId); } catch (_) { return; }
        const guildId = String(channel?.guild_id || channel?.guildId || "");
        const ctx = context(guildId);
        if (!ctx || ctx.channelId !== channelId) return;
        if (action.type === "MESSAGE_CREATE" && action.message) {
            if (!parseThemeMessage(action.message, ctx.ownerId, defaults)) return;
            revisions.set(guildId, (revisions.get(guildId) || 0) + 1);
            accept(ctx, [action.message], false);
        } else if (action.type === "MESSAGE_UPDATE") {
            revisions.set(guildId, (revisions.get(guildId) || 0) + 1);
            const cached = settings.cache[guildId];
            const messageId = String(action.message?.id || action.id || "");
            // Edited payloads can be partial. Hide a changed active image until validated again.
            if (cached?.messageId === messageId) { delete settings.cache[guildId]; notify(); }
            return sync(guildId, true);
        } else if (action.type === "MESSAGE_DELETE" || action.type === "MESSAGE_DELETE_BULK") {
            const ids = action.ids || [action.id || action.messageId];
            if (ids.some(id => String(id) === settings.cache[guildId]?.messageId)) {
                revisions.set(guildId, (revisions.get(guildId) || 0) + 1);
                delete settings.cache[guildId];
                notify();
                return sync(guildId, true);
            }
        }
    }
    return {
        start() { running = true; generation++; notify(); },
        stop() { running = false; generation++; inFlight.clear(); notify(); },
        context, snapshot, sync, event,
        contextProblem(guildId) { return resolveContext(guildId).problem; },
        status(guildId) { return statuses[guildId] || "Oczekuję na kanał tła."; },
        changed() { generation++; inFlight.clear(); notify(); },
        imageError(guildId) { status(guildId, "Nie udało się wczytać obrazka. Użyj Odśwież lub prześlij grafikę ponownie."); },
        isRunning() { return running; }
    };
}

// Node exports are removed from the installable bundle by the build script.
module.exports = { clampNumber, compareIds, safeImageUrl, isSnowflake, parseThemeMessage, latestTheme, findThemeChannel, createController };
