-- Original event posters supplied by the owner; existing article identities survive.
INSERT INTO blog_images(id,post_id,object_key,mime,uploaded_by)
SELECT 'db612aa2-a077-4c96-b84c-2f472c09f027',id,'asset:/images/blog/dubai-2027.png','image/png','admin'
FROM blog_posts WHERE slug='obuchenie-v-dubai-2027'
ON CONFLICT(post_id) DO NOTHING;
INSERT INTO blog_images(id,post_id,object_key,mime,uploaded_by)
SELECT 'fc827fb8-6e3a-499d-b9f5-25e703efc026',id,'asset:/images/blog/issyk-kul-2026.png','image/png','admin'
FROM blog_posts WHERE slug='obuchenie-v-kyrgyzstane-2026'
ON CONFLICT(post_id) DO NOTHING;
