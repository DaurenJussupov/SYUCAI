import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateName,calculateBirth} from '../src/calculations.js';
import {cities,rankMasters,distance} from '../shared/cities.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('imported interpretations match the supplied artifacts exactly',()=>{
 for(const [file,expected] of [['birth',['CONSCIOUSNESS','MISSION']],['name',['ENERGY','MAP']]]){
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
