import {parseBirthDate,reduce} from './calculations.js';
import days from './calendar-data.json' with {type:'json'};
export const calendarDays=days;
export function calendarDateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
export function calculateCalendarDay(birthValue,date,now=new Date()){
 const birth=parseBirthDate(birthValue,now);
 if(!(date instanceof Date)||!Number.isFinite(date.getTime())||date.getFullYear()<100)throw Error('Проверьте выбранную дату');
 const digits=n=>String(n).split('').map(Number);
 const personalYear=reduce([...digits(birth.day),...digits(birth.month),...digits(date.getFullYear())]).value;
 const personalMonth=reduce([personalYear,...digits(date.getMonth()+1)]).value;
 const personalDay=reduce([personalMonth,...digits(date.getDate())]).value;
 const general=reduce([...digits(date.getDate()),...digits(date.getMonth()+1),...digits(date.getFullYear())]);
 return {
  date:calendarDateKey(date),personalYear,personalMonth,
  personal:{value:personalDay,data:days[personalDay],calc:`Личный год ${personalYear} → личный месяц ${personalMonth} → личный день ${personalDay}`},
  general:{...general,data:days[general.value]}
 };
}
export function calendarMonth(birthValue,year,month,now=new Date()){
 if(!Number.isInteger(year)||year<100||year>9999||!Number.isInteger(month)||month<1||month>12)throw Error('Проверьте месяц и год');
 const count=new Date(year,month,0).getDate();
 return {offset:(new Date(year,month-1,1).getDay()+6)%7,days:Array.from({length:count},(_,i)=>({day:i+1,...calculateCalendarDay(birthValue,new Date(year,month-1,i+1),now)}))};
}
