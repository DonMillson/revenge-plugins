# SG Server Backgrounds 0.2.0-beta.1 — By DonMillson

Native gallery: metro.findByProps("launchImageLibrary"), callback/Promise, includeBase64. Native file picker: pickSingle/isCancel, import + documentDirectory; use fileCopyUri. Local preview via React Native Image. Assets exist only in React state and are not persisted as base64.

Settings publication uses authenticated HTTPS PUT (JSON base64 or native FormData). Successful responses are validated before updating the shared cache. Members perform public GET by guild ID every 30 seconds while active; 15 second minimum poll interval, coalesced requests, rate-limit backoff, persisted validated last configuration, generation and per-guild epochs to discard late/obsolete responses. DELETE publishes enabled:false.

Service origin is fixed in config.json. Manifest schema: 1, guildId, revision (32 hex), enabled, updatedAt; enabled assets include assetPath (/assets/guildId/revision), fileName, mimeType, size, width, height, dim, blur. Only PNG/JPEG/WEBP, 10 MiB, 4096 px per side. The service authenticates X-Owner-Key by SHA-256 secret, checks bytes, uses conditional R2 publication, retains three revisions. The key grants write access to this service; server-side Discord ownership is not independently verified. Native UI checks GuildStore owner against UserStore before every publish.

No Discord HTTP message API, tokens, message scraping or channel discovery. SelectedChannelStore, ChannelStore, GuildStore and UserStore supply only local context. Message view patch locates MessagesConnected or Messages render, wraps the original tree with image and dim layers, clones limited native surfaces to transparent, and excludes DMs. Frozen elements/stores remain untouched. Error boundary and image error preserve original messages. Unload removes patches, dispatcher/AppState listeners, timers and aborts native requests.

Compatibility: Revenge Classic expression loader. manifest.hash is SHA-256 of exact served index.js bytes. No external npm dependencies. Native phone verification remains required.
