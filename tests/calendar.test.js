import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {calendarDays,calendarMonth,calculateCalendarDay} from '../src/calendar-calculations.js';
import {calculateBirth} from '../src/calculations.js';
test('calendar interpretations are exactly the supplied artifact',()=>{
 const prefix=readFileSync('references/artifacts/calendar.html','utf8').split('<script>')[1].split('var root =')[0].replace('(function () {','');
 assert.deepEqual(calendarDays,JSON.parse(vm.runInNewContext(prefix+';JSON.stringify(DAYS)')));
});
test('month lengths, Monday-first offsets, invalid input and today summary agree',()=>{
 const now=new Date(2026,10,9,12),value='24.09.1987';
 const leap=calendarMonth(value,2024,2,now);assert.equal(leap.days.length,29);assert.equal(leap.offset,3);assert.equal(leap.days.at(-1).date,'2024-02-29');
 assert.equal(calendarMonth(value,2100,2,now).days.length,28);
 assert.equal(calendarMonth(value,2000,2,now).days.length,29);
 const today=calculateCalendarDay(value,now,now),birth=calculateBirth(value,now);
 assert.equal(today.personal.value,birth.personalDay.value);assert.equal(today.general.value,birth.generalDay.value);
 assert.throws(()=>calendarMonth(value,2026,13,now));assert.throws(()=>calculateCalendarDay('31.02.2000',now,now));assert.throws(()=>calculateCalendarDay(value,new Date('invalid'),now));
});
function artifactResult(birthValue,target,now){
 const nodes=new Map();
 function node(tag='div'){
  const element={tag,children:[],value:'',handlers:{},attributes:{},className:'',appendChild(child){this.children.push(child);return child},setAttribute(k,v){this.attributes[k]=v},addEventListener(k,handler){this.handlers[k]=handler},scrollIntoView(){}};
  let text='';Object.defineProperty(element,'textContent',{get:()=>text,set:v=>{text=v;element.children=[]}});
  Object.defineProperty(element,'innerHTML',{set:()=>{element.children=[];text=''},get:()=>''});
  Object.defineProperty(element,'options',{get:()=>element.children.filter(c=>c.tag==='option')});
  const classes=new Set();element.classList={add:c=>classes.add(c),contains:c=>classes.has(c),toggle:c=>{if(classes.has(c)){classes.delete(c);return false}classes.add(c);return true}};
  return element;
 }
 const root={querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)}};
 const input=root.querySelector('#sd-birth');input.value=birthValue;
 class SourceDate extends Date{constructor(...args){super(...(args.length?args:[now.getTime()]))}}
 const source=readFileSync('references/artifacts/calendar.html','utf8').split('<script>')[1].split('</script>')[0];
 vm.runInNewContext(source,{Date:SourceDate,document:{getElementById:()=>root,createElement:tag=>node(tag),createTextNode:text=>({textContent:text})}});
 root.querySelector('#sd-open').handlers.click();
 for(const [id,value] of [['#sd-year',target.getFullYear()],['#sd-month',target.getMonth()+1]]){const select=root.querySelector(id);select.value=value;select.handlers.change.call(select)}
 const day=root.querySelector('#sd-grid').children.find(el=>el.tag==='button'&&Number(el.children[0].textContent)===target.getDate());assert.ok(day);day.handlers.click();
 return selector=>root.querySelector(selector).textContent;
}
test('calendar values and advice agree with original HTML on selected past and future dates',()=>{
 const now=new Date(2026,10,9,12);
 for(const birth of ['24.09.1987','29.02.2000','01.01.1900'])for(const selected of [new Date(2024,1,1),new Date(2024,1,29),new Date(2026,11,31),new Date(2027,0,1)]){
  const original=artifactResult(birth,selected,now),actual=calculateCalendarDay(birth,selected,now);
  for(const [kind,prefix] of [['personal','#sd-p'],['general','#sd-g']]){
   assert.equal(actual[kind].value,Number(original(prefix+'-num')));
   for(const [property,suffix] of [['title','-name'],['summary','-sum'],['todo','-todo'],['avoid','-avoid']])assert.equal(actual[kind].data[property],original(prefix+suffix));
  }
 }
});
