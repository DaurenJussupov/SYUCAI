# Reviewed translation overrides

Add `<locale>.json` here to replace machine translation, including languages the provider does not support.
Use the full catalog structure `{ "locale": "en", "status": "ready", "sourceHash": "<from src/i18n/source.json>", "translations": { "<Russian source message>": "<translation>" } }`.
Every source message must have a translation; preserve placeholders such as `{0}` exactly. A stale or incomplete override stops the build so it cannot silently overwrite reviewed text.
These files contain public copy only. Never put passwords, credentials or user data here.
