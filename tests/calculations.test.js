import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateName,calculateBirth} from '../src/calculations.js';
import {cities,rankMasters,distance} from '../shared/cities.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('imported interpretations match the supplied artifacts exactly',()=>{
 for(const [file,expected] of [['birth',['CONSCIOUSNESS','MISSION','DAYS']],['name',['ENERGY','MAP']]]){
  const html=readFileSync(`references/artifacts/${file}.html`,'utf8');
  const prefix=html.split('<script>')[1].split('var root =')[0].replace('(function () {','');
  const output=vm.runInNewContext(prefix+';JSON.stringify({'+expected.join(',')+'})');
  assert.deepEqual(JSON.parse(output),JSON.parse(readFileSync(`src/${file}-data.json`,'utf8')));
 }
});
test('all 26 Latin letters retain the source mapping and reduction',()=>{
 const map=JSON.parse(readFileSync('src/name-data.json')).MAP;
 for(const [c,n] of Object.entries(map).filter(([c])=>/[A-Z]/.test(c))){assert.equal(calculateName(c).value,n)}
 assert.equal(calculateName('Anara Kairbekova').value,3);
 assert.equal(calculateName('Anna').value,3);
 for(const s of ['Анна','A漢','A1','Émile','', '<script>'])assert.throws(()=>calculateName(s));
 assert.equal(calculateName("Mary-Jane O'Neil").value,calculateName('Mary Jane O Neil').value);
});
test('date reductions, leap years, future and impossible dates',()=>{
 const v=calculateBirth('24.09.1987');assert.equal(v.consciousness.value,6);assert.equal(v.mission.value,4);
 assert.doesNotThrow(()=>calculateBirth('29.02.2000'));
 for(const s of ['29.02.1900','31.04.2000','00.12.2000','01.13.2000','01.01.1899','01.01.2999'])assert.throws(()=>calculateBirth(s));
 for(let n=1;n<=31;n++){const b=calculateBirth(`${String(n).padStart(2,'0')}.01.2000`);assert.ok(b.consciousness.data);assert.ok(b.mission.data)}
});
test('same city first, then distance within country, never unrelated countries',()=>{
 const city=cities.find(c=>c.id==='almaty');const ms=['astana','bishkek','almaty','shymkent'].map(id=>({...cities.find(c=>c.id===id)}));
 const result=rankMasters(ms,city);assert.deepEqual(result.map(m=>m.id),['almaty','shymkent','astana']);assert.equal(result[0].distance,0);assert.ok(distance(city,ms[0])>900);
});

test('daily calculations use the current calendar date, including year and leap-day boundaries', () => {
 const first = calculateBirth('24.09.1987', new Date(2026, 10, 9, 12));
 assert.deepEqual([first.personalYear, first.personalMonth, first.personalDay.value, first.generalDay.value], [7, 9, 9, 3]);
 assert.equal(first.today, '2026-11-09');
 assert.equal(first.personalDay.data.planet, 'Марс');
 assert.equal(first.generalDay.data.planet, 'Юпитер');
 const last = calculateBirth('24.09.1987', new Date(2026, 11, 31, 12));
 assert.deepEqual([last.personalYear, last.personalMonth, last.personalDay.value, last.generalDay.value], [7, 1, 5, 8]);
 const next = calculateBirth('24.09.1987', new Date(2027, 0, 1, 12));
 assert.deepEqual([next.personalYear, next.personalMonth, next.personalDay.value, next.generalDay.value], [8, 9, 1, 4]);
 const leap = calculateBirth('29.02.2000', new Date(2028, 1, 29, 12));
 assert.deepEqual([leap.personalDay.value, leap.generalDay.value], [2, 7]);
 const another = calculateBirth('24.09.1990', new Date(2026, 10, 9, 12));
 assert.equal(first.personalDay.value, another.personalDay.value);
 assert.equal(first.generalDay.value, calculateBirth('01.01.2000', new Date(2026, 10, 9, 12)).generalDay.value);
});

// Execute the uploaded HTML itself against a small DOM harness: independent source of truth.
function sourceBirthResult(inputValue, now) {
 const nodes = new Map();
 function node() { return {value: '', textContent: '', innerHTML: '', handlers: {}, appendChild() {}, classList: {add() {}, remove() {}}, addEventListener(type, handler) {this.handlers[type] = handler}}; }
 const root = {querySelector(selector) {if (!nodes.has(selector)) nodes.set(selector, node());return nodes.get(selector)}};
 root.querySelector('#nc-date').value = inputValue;
 class SourceDate extends Date {constructor(...args) {super(...(args.length ? args : [now.getTime()]))}}
 const source = readFileSync('references/artifacts/birth.html', 'utf8').split('<script>')[1].split('</script>')[0];
 vm.runInNewContext(source, {Date:SourceDate,document:{getElementById:()=>root,createElement:()=>node()}});
 root.querySelector('#nc-form').handlers.submit({preventDefault() {}});
 assert.equal(root.querySelector('#nc-error').textContent, '');
 return selector => root.querySelector(selector).textContent;
}
test('new calculator agrees with original HTML formulas and daily recommendations', () => {
 for (const now of [new Date(2026, 10, 9, 12), new Date(2026, 11, 31, 12), new Date(2027, 0, 1, 12), new Date(2028, 1, 29, 12)]) {
  for (const input of ['24.09.1987', '29.02.2000', '01.01.1900', '31.12.2001', '09.11.2020']) {
   const original = sourceBirthResult(input, now), result = calculateBirth(input, now);
   assert.equal(result.personalDay.value, Number(original('#nc-p-num')));
   assert.equal(result.generalDay.value, Number(original('#nc-g-num')));
   assert.equal(result.consciousness.value, Number(original('#nc-c-num')));
   assert.equal(result.mission.value, Number(original('#nc-m-num')));
   for (const [day, prefix] of [[result.personalDay, '#nc-p'], [result.generalDay, '#nc-g']]) {
    assert.equal(day.data.title, original(prefix+'-name'));
    assert.equal(day.data.summary, original(prefix+'-sum'));
    assert.equal(day.data.todo, original(prefix+'-todo'));
    assert.equal(day.data.avoid, original(prefix+'-avoid'));
   }
  }
 }
});
