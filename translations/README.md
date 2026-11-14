# Reviewed translation overrides

Add `<locale>.json` here to replace machine translation, including languages the provider does not support.
Use the full catalog structure `{ "locale": "en", "status": "ready", "sourceHash": "<from src/i18n/source.json>", "translations": { "<Russian source message>": "<translation>" } }`.
Every source message must have a translation; preserve placeholders such as `{0}` exactly. A stale or incomplete override stops the build so it cannot silently overwrite reviewed text.
These files contain public copy only. Never put passwords, credentials or user data here.


Machine-generated snapshots may be kept in `cache/<locale>.json` with the same `locale` and `translations` structure. Unlike reviewed overrides, a machine snapshot may have an older sourceHash or be incomplete. Only exact source messages with intact placeholders and safe text are reused. A copy edit or failed refresh publishes a clearly marked `partial` catalog instead of disabling the whole language. The browser can recover these entries even from legacy `unavailable` catalogs. No translation is invented for missing entries.

Production uses the public Google gtx GET interface with a second host on failure and honors transient-error backoff. If no foreign-language catalog contains usable translations, generation exits with an error to stop deployment. Cloudflare Workers Builds is detected by `WORKERS_CI` independently of token injection. Set `SYUCAI_BUILD_TRANSLATIONS=1` to generate remotely outside Workers Builds, or `SYUCAI_SKIP_REMOTE_SETUP=1` for offline dry runs.
