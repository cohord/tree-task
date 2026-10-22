const assert=require('node:assert/strict');
const C=require('../dependency-core.js');
const mk=(id,start,end,preds=[],children=[])=>({id,title:id,startDate:start,endDate:end,predecessorIds:preds,children});
const get=(tree,id)=>C.index(tree).byId.get(id);
const check=(name,fn)=>{fn();console.log('PASS '+name);};
check('cascades forward while retaining gaps and original tree',()=>{
 const input=[mk('a','2026-10-01','2026-10-03'),mk('b','2026-10-07','2026-10-08',['a']),mk('c','2026-10-11','2026-10-12',['b'])];
 const next=C.reschedule(input,'a',{startDate:'2026-10-04',endDate:'2026-10-06'});
 assert.equal(get(next,'b').startDate,'2026-10-10');assert.equal(get(next,'c').startDate,'2026-10-14');assert.equal(get(input,'b').startDate,'2026-10-07');
});
check('cascades backwards when prerequisites allow',()=>{
 const input=[mk('a','2026-10-05','2026-10-08'),mk('b','2026-10-12','2026-10-15',['a'])];
 const next=C.reschedule(input,'a',{startDate:'2026-10-03',endDate:'2026-10-06'});
 assert.equal(get(next,'b').startDate,'2026-10-10');
});
check('adding a new predecessor resolves an overlap',()=>{
 const input=[mk('a','2026-10-06','2026-10-08'),mk('b','2026-10-07','2026-10-09'),mk('c','2026-10-11','2026-10-12',['b'])];
 const next=C.reschedule(input,'b',undefined,['a']);
 assert.equal(get(next,'b').startDate,'2026-10-09');assert.equal(get(next,'c').startDate,'2026-10-13');
});
check('multiple predecessors in a diamond shift only once',()=>{
 const input=[mk('a','2026-10-01','2026-10-02'),mk('b','2026-10-05','2026-10-06',['a']),mk('c','2026-10-05','2026-10-06',['a']),mk('d','2026-10-08','2026-10-09',['b','c'])];
 const next=C.reschedule(input,'a',{startDate:'2026-10-03',endDate:'2026-10-04'});
 assert.equal(get(next,'d').startDate,'2026-10-10');
});
check('another fixed predecessor prevents moving too far backwards',()=>{
 const input=[mk('a','2026-10-01','2026-10-06'),mk('b','2026-10-01','2026-10-10'),mk('c','2026-10-13','2026-10-15',['a','b'])];
 const next=C.reschedule(input,'a',{startDate:'2026-09-25',endDate:'2026-09-30'});
 assert.equal(get(next,'c').startDate,'2026-10-11');
});
check('circular, self and ancestor links are rejected',()=>{
 const input=[mk('a','2026-10-01','2026-10-02'),mk('b','2026-10-03','2026-10-05',['a']),mk('c','2026-10-07','2026-10-08',['b'])];
 assert.throws(()=>C.reschedule(input,'a',undefined,['c']),/Circular/);
 assert.throws(()=>C.reschedule(input,'a',undefined,['a']),/itself/);
 const nested=[mk('parent',null,null,[],[mk('child','2026-10-01','2026-10-02')])];
 assert.throws(()=>C.reschedule(nested,'parent',undefined,['child']),/parent/);
 assert.throws(()=>C.reschedule(nested,'child',undefined,['parent']),/ancestor/);
});
check('parent rollup feeds downstream dependencies',()=>{
 const input=[mk('parent',null,null,[],[mk('child','2026-10-01','2026-10-02')]),mk('review','2026-10-04','2026-10-05',['parent'])];
 const next=C.reschedule(input,'child',{startDate:'2026-10-05',endDate:'2026-10-06'});
 assert.equal(get(next,'review').startDate,'2026-10-08');
});
check('deleting a task cleans successor links',()=>{
 const input=[mk('a',null,null),mk('b',null,null,['a'])];
 C.purgeReferences(input,['a']);assert.deepEqual(get(input,'b').predecessorIds,[]);
});
console.log('All dependency checks passed.');