// Three calendar months, clamped to the last day of the destination month.
export function trialPeriod(createdAt,now=new Date()){
 const raw=String(createdAt||'');
 const start=new Date(/Z$|[+-]\d\d:\d\d$/.test(raw)?raw:raw.replace(' ','T')+'Z');
 if(!Number.isFinite(start.getTime()))return null;
 const end=new Date(start);const day=start.getUTCDate();end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+3);
 const lastDay=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();end.setUTCDate(Math.min(day,lastDay));
 return {startsAt:start.toISOString(),endsAt:end.toISOString(),active:now.getTime()<end.getTime()};
}
