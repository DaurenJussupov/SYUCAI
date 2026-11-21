// Minimal article formatting; user-supplied HTML always remains literal text.
export function renderBlogContent(content,esc){
 const inline=text=>text.split(/(https?:\/\/[^\s<>"']+)/g).map(part=>{
  if(!/^https?:\/\//.test(part))return esc(part).replaceAll('\n','<br>');
  const url=part.replace(/[.,;:!?\)\]]+$/,'');
  return `<a class="text-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>${esc(part.slice(url.length))}`;
 }).join('');
 return String(content||'').split(/\n\s*\n/).filter(Boolean).map(block=>{
  if(/^## /.test(block))return `<h2>${inline(block.slice(3))}</h2>`;
  const lines=block.split('\n');
  if(lines.every(line=>/^(?:\*|-) /.test(line)))return `<ul>${lines.map(line=>`<li>${inline(line.slice(2))}</li>`).join('')}</ul>`;
  return `<p>${inline(block)}</p>`;
 }).join('');
}
