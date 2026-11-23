-- Anonymous daily totals survive the 90-day cleanup of raw analytics events.
CREATE TABLE master_daily_stats (
 master_id TEXT NOT NULL REFERENCES accounts(id), day TEXT NOT NULL,
 views INTEGER NOT NULL DEFAULT 0, contacts INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(master_id,day)
);
INSERT INTO master_daily_stats(master_id,day,views,contacts)
 SELECT a.master_id,date(a.created_at,'+5 hours'),SUM(a.event='master_view'),SUM(a.event='whatsapp_click')
 FROM analytics_events a JOIN profiles p ON p.id=a.master_id
 WHERE a.event IN ('master_view','whatsapp_click') GROUP BY a.master_id,date(a.created_at,'+5 hours');
CREATE TRIGGER master_stats_collect AFTER INSERT ON analytics_events
 WHEN NEW.event IN ('master_view','whatsapp_click') AND EXISTS(SELECT 1 FROM profiles WHERE id=NEW.master_id AND status='approved')
 BEGIN
 INSERT INTO master_daily_stats(master_id,day,views,contacts)
 VALUES(NEW.master_id,date(NEW.created_at,'+5 hours'),NEW.event='master_view',NEW.event='whatsapp_click')
 ON CONFLICT(master_id,day) DO UPDATE SET views=views+excluded.views,contacts=contacts+excluded.contacts;
 END;
