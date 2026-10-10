# Weryfikacja 0.2.0-beta.1

Wykonano npm run check: 20/20 testów pluginu. Backend: node --test test/worker.test.mjs: 7/7 testów. Native picker and rendering are simulated; no phone has been tested.

Meaningful coverage: exact loader/hash, immutable messages, all guild channels/DM exclusion, gallery preview and remote publication, document-picker multipart upload, member reads without key, cancelled picker, shared disable, private diagnostics, image fallback, lazy module recovery, unsafe manifest/assets, offline cache, request coalescing/backoff, publish/poll and unload races. Service checks both upload formats, authorization, MIME/dimensions/size, concurrent conditional writes, bounded history and readiness.

Deployment and public bundle verification are recorded by the release process. A successful deployment does not confirm native compatibility. Complete TEST_NA_TELEFONIE.md on two phones before claiming device support.
