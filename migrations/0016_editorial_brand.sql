-- Only institute-authored seed publications; never rewrite user-generated content.
UPDATE blog_posts SET content=REPLACE(content,'Сюцай','SYUCAI'),excerpt=REPLACE(excerpt,'Сюцай','SYUCAI'),updated_at=CURRENT_TIMESTAMP WHERE id IN ('cd1d2ca1-5932-4fca-8259-ed0133dbed27','315a9e6d-de56-4b78-9a6d-1377c3916c45') AND (content LIKE '%Сюцай%' OR excerpt LIKE '%Сюцай%');
