/* Tree Task v4: pure finish-to-start scheduling; ISO calendar days, no network/timezone. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.TreeDependencies=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const DAY=86400000;
const clone=x=>JSON.parse(JSON.stringify(x));
function day(s){if(typeof s!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s))throw Error('Invalid task date');const t=Date.parse(s+'T00:00:00Z');if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==s)throw Error('Invalid task date');return Math.floor(t/DAY);}
function date(n){return new Date(n*DAY).toISOString().slice(0,10);}
function shift(d,amount){return date(day(d)+amount);}
function index(tree){
 const byId=new Map(),parent=new Map(),order=[];
 function walk(list,p,depth){if(!Array.isArray(list)||depth>100)throw Error('Invalid tree');for(const n of list){
  if(!n||typeof n.id!=='string'||!n.id||byId.has(n.id))throw Error('Duplicate or missing task ID');
  byId.set(n.id,n);parent.set(n.id,p);order.push(n.id);if(order.length>10000)throw Error('Too many tasks');
  const preds=n.predecessorIds??[];if(!Array.isArray(preds)||preds.length>100||preds.some(x=>typeof x!=='string')||new Set(preds).size!==preds.length)throw Error('Invalid predecessors on '+(n.title||n.id));
  if(n.startDate)day(n.startDate);if(n.endDate)day(n.endDate);if(n.startDate&&n.endDate&&day(n.endDate)<day(n.startDate))throw Error('Task end before start');
  walk(n.children,n.id,depth+1);
 }}walk(tree,null,0);
 const edges=new Map(order.map(id=>[id,[]])),incoming=new Map(order.map(id=>[id,0]));
 function edge(a,b){edges.get(a).push(b);incoming.set(b,incoming.get(b)+1);}
 for(const id of order){const n=byId.get(id),p=parent.get(id);if(p!==null)edge(id,p);
  for(const pred of(n.predecessorIds??[])){
   if(!byId.has(pred))throw Error('A predecessor for '+(n.title||id)+' no longer exists');
   if(pred===id)throw Error('A task cannot depend on itself');
   let a=p;while(a!==null){if(a===pred)throw Error('A task cannot depend on its parent or ancestor');a=parent.get(a);}
   a=parent.get(pred);while(a!==null){if(a===id)throw Error('A parent cannot depend on one of its children');a=parent.get(a);}
   edge(pred,id);
  }
 }
 const q=order.filter(id=>incoming.get(id)===0),sorted=[];
 for(let i=0;i<q.length;i++){const id=q[i];sorted.push(id);for(const next of edges.get(id)){incoming.set(next,incoming.get(next)-1);if(incoming.get(next)===0)q.push(next);}}
 if(sorted.length!==order.length)throw Error('Circular task dependency detected');
 return {byId,parent,order:sorted};
}
function ranges(idx){const cache=new Map();function get(id){if(cache.has(id))return cache.get(id);const n=idx.byId.get(id);let s=n.startDate?day(n.startDate):n.endDate?day(n.endDate):null,e=n.endDate?day(n.endDate):n.startDate?day(n.startDate):null;
 for(const c of n.children){const r=get(c.id);if(r){s=s===null?r.start:Math.min(s,r.start);e=e===null?r.end:Math.max(e,r.end);}}
 const result=s===null?null:{start:s,end:e};cache.set(id,result);return result;}
 for(const id of idx.order)get(id);return cache;
}
function validateTree(tree){const idx=index(tree),rs=ranges(idx);for(const id of idx.order){const n=idx.byId.get(id),start=n.startDate||n.endDate;if(!start)continue;
  const required=Math.max(-Infinity,...(n.predecessorIds??[]).map(p=>rs.get(p)?.end===undefined?-Infinity:rs.get(p).end+1));
  if(day(start)<required)throw Error('Task “'+(n.title||id)+'” starts before a predecessor finishes');
 }return tree;}
/** Atomic finish-to-start cascade. Shifts preserve gaps, including backward moves.
 * Adding a conflicting predecessor pushes successors just enough to satisfy dates. */
function reschedule(tree,id,dates,predecessorIds){
 const oldIdx=index(tree),old=ranges(oldIdx),result=clone(tree),idx=index(result);if(!idx.byId.has(id))throw Error('Task not found');
 const target=idx.byId.get(id);
 if(predecessorIds!==undefined)target.predecessorIds=[...predecessorIds];
 if(dates!==undefined){target.startDate=dates.startDate??null;target.endDate=dates.endDate??null;}
 const graph=index(result),updated=ranges(graph);
 function refresh(key){let cur=key;while(cur!==null){const n=graph.byId.get(cur);let s=n.startDate?day(n.startDate):n.endDate?day(n.endDate):null,e=n.endDate?day(n.endDate):n.startDate?day(n.startDate):null;
  for(const c of n.children){const r=updated.get(c.id);if(r){s=s===null?r.start:Math.min(s,r.start);e=e===null?r.end:Math.max(e,r.end);}}
  updated.set(cur,s===null?null:{start:s,end:e});cur=graph.parent.get(cur);}}
 function required(n){let start=-Infinity;for(const p of(n.predecessorIds??[])){const r=updated.get(p);if(r)start=Math.max(start,r.end+1);}return start;}
 function move(n,delta){if(!delta||(!n.startDate&&!n.endDate))return;const start=n.startDate||n.endDate,end=n.endDate||n.startDate;n.startDate=shift(start,delta);n.endDate=shift(end,delta);refresh(n.id);}
 const editedStart=target.startDate||target.endDate;
 if(editedStart){const violation=required(target)-day(editedStart);if(violation>0)move(target,violation);}
 for(const current of graph.order){if(current===id)continue;const n=graph.byId.get(current),preds=n.predecessorIds??[];
  if(!preds.length||(!n.startDate&&!n.endDate))continue;
  const deltas=preds.map(p=>{const before=old.get(p)?.end,after=updated.get(p)?.end;return before===undefined||after===undefined?0:after-before;}).filter(d=>d!==0);
  const propagation=deltas.length?(deltas.some(d=>d>0)?Math.max(...deltas):Math.min(...deltas)):0;
  const floor=required(n)-day(n.startDate||n.endDate);
  const amount=Math.max(propagation,Number.isFinite(floor)?floor:0);
  move(n,amount);
 }
 validateTree(result);
 return result;
}
function purgeReferences(tree,deleted){const gone=new Set(deleted);function visit(list){for(const n of list){n.predecessorIds=(n.predecessorIds??[]).filter(id=>!gone.has(id));visit(n.children);}}visit(tree);return tree;}
return {index,ranges,validateTree,reschedule,purgeReferences};
});