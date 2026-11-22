CREATE TABLE email_confirmation_codes (
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 registration_type TEXT NOT NULL CHECK(registration_type IN ('master','user')),
 nonce TEXT NOT NULL,
 code_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(account_id,registration_type)
);
CREATE TABLE email_confirmation_limits (
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 registration_type TEXT NOT NULL,
 last_sent INTEGER NOT NULL,
 window_start INTEGER NOT NULL,
 hits INTEGER NOT NULL,
 PRIMARY KEY(account_id,registration_type)
);
-- Correct only the obsolete instruction to register a separate member account.
-- Keep the moderation decision and every unrelated moderator comment intact.
UPDATE profiles SET moderation_note='Для размещения анкеты мастера заполните сведения, укажите WhatsApp, добавьте фото и диплом и отправьте анкету на проверку. Отдельная регистрация пользователя не требуется.' WHERE (moderation_note LIKE '%зарегистрироваться через%' OR moderation_note LIKE '%зарегистрироваться Через%') AND (moderation_note LIKE '%Личный Кабинет%' OR moderation_note LIKE '%Личный кабинет%');
UPDATE account_registrations SET application_note='Для размещения анкеты мастера заполните сведения, укажите WhatsApp, добавьте фото и диплом и отправьте анкету на проверку. Отдельная регистрация пользователя не требуется.' WHERE registration_type='master' AND (application_note LIKE '%зарегистрироваться через%' OR application_note LIKE '%зарегистрироваться Через%') AND (application_note LIKE '%Личный Кабинет%' OR application_note LIKE '%Личный кабинет%');
