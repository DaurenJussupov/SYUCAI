import sources from './blog-source.json' with {type:'json'};
export const blogSources=sources;
export function blogTextMessages(content){
 const messages=[];
 for(const block of String(content||'').split(/\n\s*\n/).filter(Boolean)){
  const lines=block.split('\n'),parts=/^## /.test(block)?[block.slice(3)]:lines.every(line=>/^(?:\*|-) /.test(line))?lines.map(line=>line.slice(2)):[block];
  for(const part of parts)for(const text of part.split(/(https?:\/\/[^\s<>"']+)/g))if(!/^https?:\/\//.test(text)&&/[А-Яа-яЁё]/.test(text))messages.push(text.trim());
 }
 return [...new Set(messages.filter(Boolean))];
}
export function blogSource(post){
 const source=sources.find(p=>p.slug===post.slug);if(!source||source.title!==post.title||source.excerpt!==(post.excerpt||''))return null;
 if(typeof post.content==='string'?post.content!==source.content:post.translationSource!==post.slug)return null;
 return source;
}
export function blogTranslationMessages(post){const source=blogSource(post);return source?[source.title,source.excerpt,...blogTextMessages(source.content)].filter(text=>/[А-Яа-яЁё]/.test(text)):[]}
export function blogTranslationAvailable(post,locale,hasTranslation){return locale==='ru'||!!blogSource(post)&&blogTranslationMessages(post).every(key=>hasTranslation(key))}
