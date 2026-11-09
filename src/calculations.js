import birth from './birth-data.json' with {type:'json'};
import name from './name-data.json' with {type:'json'};
export const latinPattern = /^[A-Za-z]+(?:[ '\-][A-Za-z]+)*$/;
export function reduce(digits){
 let n=digits.reduce((a,b)=>a+b,0), steps=[`${digits.join(' + ')} = ${n}`];
 while(n>9){const d=String(n).split('').map(Number);n=d.reduce((a,b)=>a+b,0);steps.push(`${d.join(' + ')} = ${n}`)}
 return {value:n,calc:steps.join(' → ')};
}
export function calculateName(raw){
 const text=raw.trim();if(!latinPattern.test(text)||text.length>80)throw Error('Use Latin letters · Используйте латинский алфавит');
 const letters=[...text.toUpperCase()].filter(c=>name.MAP[c]);
 const result=reduce(letters.map(c=>name.MAP[c]));
 return {...result,data:name.ENERGY[result.value],letters:letters.map(c=>[c,name.MAP[c]])};
}
export function calculateBirth(value,now=new Date()){
 const m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);if(!m)throw Error('Введите дату в формате ДД.ММ.ГГГГ');
 const [d,mo,y]=m.slice(1).map(Number), date=new Date(y,mo-1,d);
 if(y<1900||date>now||date.getFullYear()!==y||date.getMonth()!==mo-1||date.getDate()!==d)throw Error('Проверьте дату рождения');
 const c=reduce(String(d).split('').map(Number)),mission=reduce(m.slice(1).join('').split('').map(Number));
 return {consciousness:{...c,data:birth.CONSCIOUSNESS[c.value]},mission:{...mission,data:birth.MISSION[mission.value]}};
}
