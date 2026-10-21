/* Pure, date-only planning helpers for Gantt and Calendar. No time-zone drift. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.TreePlanning=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const DAY=86400000;
function validDate(value){if(typeof value!=='string'||!/^(\d{4})-(\d{2})-(\d{2})$/.test(value))return false;const d=new Date(value+'T00:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value;}
function toDay(date){if(!validDate(date))throw Error('Invalid date: '+date);return Math.floor(Date.parse(date+'T00:00:00Z')/DAY);}
function fromDay(day){return new Date(day*DAY).toISOString().slice(0,10);}
function addDays(date,amount){return fromDay(toDay(date)+amount);}
function diffDays(start,end){return toDay(end)-toDay(start);}
function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function weekStart(date){const wd=(new Date(date+'T00:00:00Z').getUTCDay()+6)%7;return addDays(date,-wd);}
function monthStart(date){return date.slice(0,7)+'-01';}
function moveMonth(date,amount){const day=Number(date.slice(8,10));const m=new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7))-1+amount,1));const y=m.getUTCFullYear(),month=m.getUTCMonth();const end=new Date(Date.UTC(y,month+1,0)).getUTCDate();return `${y}-${String(month+1).padStart(2,'0')}-${String(Math.min(day,end)).padStart(2,'0')}`;}
function normalizedDates(n){let start=n.startDate??null,end=n.endDate??null;if(start!==null&&!validDate(start))throw Error('Invalid task start date');if(end!==null&&!validDate(end))throw Error('Invalid task end date');if(start&&end&&end<start)throw Error('End date must not precede start date');return {startDate:start,endDate:end};}
function explicitRange(n){const dates=normalizedDates(n);if(!dates.startDate&&!dates.endDate)return null;return {start:dates.startDate||dates.endDate,end:dates.endDate||dates.startDate,derived:false};}
function rollup(n){const own=explicitRange(n);const child=n.children.map(rollup).filter(Boolean);if(!own&&!child.length)return null;const ranges=[...(own?[own]:[]),...child];return {start:ranges.map(r=>r.start).sort()[0],end:ranges.map(r=>r.end).sort().at(-1),derived:!own};}
function flattenBranch(nodes, selected){function find(arr){for(const node of arr){if(node.id===selected)return node;const child=find(node.children);if(child)return child;}return null;}const roots=selected?[find(nodes)].filter(Boolean):nodes;const out=[];function walk(arr,depth){for(const n of arr){out.push({node:n,depth,range:rollup(n),explicit:explicitRange(n)});walk(n.children,depth+1);}}walk(roots,0);return out;}
function tasksForDay(rows,day){return rows.filter(r=>r.explicit&&r.explicit.start<=day&&r.explicit.end>=day);}
return {validDate,toDay,fromDay,addDays,diffDays,today,weekStart,monthStart,moveMonth,normalizedDates,explicitRange,rollup,flattenBranch,tasksForDay};
});
