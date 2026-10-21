/* Deterministic three-way merge for Tree Task. Pure JS; also used by tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TreeMerge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = x => JSON.parse(JSON.stringify(x));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const fields = ['title', 'completed', 'collapsed', 'startDate', 'endDate'];
  function index(tree) {
    const byId = new Map(), shape = [];
    function walk(list, parent) {
      list.forEach((n, pos) => {
        if (byId.has(n.id)) throw Error('Duplicate task ID');
        byId.set(n.id, n);
        shape.push([n.id, parent, pos]);
        walk(n.children, n.id);
      });
    }
    walk(tree, null);
    return {byId, shape: JSON.stringify(shape)};
  }
  function windowPlanDates(n){
    const start=n.startDate??null,end=n.endDate??null;
    const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
    if((start&&!valid(start))||(end&&!valid(end))||(start&&end&&end<start))throw Error('Invalid planning dates in cloud file');
    return {startDate:start,endDate:end};
  }
  function validate(tree) {
    let total = 0; const seen = new Set();
    function walk(list, depth) {
      if (!Array.isArray(list) || depth > 100) throw Error('Invalid tree depth');
      return list.map(n => {
        if (!n || typeof n !== 'object' || Array.isArray(n) ||
            typeof n.id !== 'string' || !n.id || n.id.length > 200 || seen.has(n.id) ||
            typeof n.title !== 'string' || n.title.length > 2000 ||
            typeof n.completed !== 'boolean' || typeof n.collapsed !== 'boolean') throw Error('Invalid task in cloud file');
        if (++total > 10000) throw Error('Too many tasks in cloud file');
        seen.add(n.id);
        const {startDate,endDate}=windowPlanDates(n);
        return {id:n.id, title:n.title, completed:n.completed, collapsed:n.collapsed, startDate, endDate, children:walk(n.children,depth+1)};
      });
    }
    return walk(tree,0);
  }
  function merge(base, local, remote) {
    base=validate(base);local=validate(local);remote=validate(remote);
    const b=index(base), l=index(local), r=index(remote);
    const ls=l.shape!==b.shape, rs=r.shape!==b.shape;
    if (ls && rs && l.shape!==r.shape) return {ok:false, reason:'Both devices changed the tree structure (added, deleted or moved tasks).'};
    const result = clone(ls?local:remote);
    const out=index(result).byId;
    const taskIds = new Set([...b.byId.keys(), ...l.byId.keys(), ...r.byId.keys()]);
    for (const id of taskIds) {
      const old=b.byId.get(id), a=l.byId.get(id), z=r.byId.get(id), target=out.get(id);
      if (!old) {
        if (a && z && !fields.every(k=>equal(a[k],z[k]))) return {ok:false, reason:'A new task was edited differently on both devices.'};
        continue;
      }
      if (!target) {
        const survivor=a||z;
        if (survivor && fields.some(k=>!equal(survivor[k],old[k]))) return {ok:false,reason:'A task was deleted on one device but edited on the other.'};
        continue;
      }
      if (!a || !z) return {ok:false,reason:'A task was deleted on one device but still exists on the other.'};
      for (const k of fields) {
        const ac=!equal(a[k],old[k]), zc=!equal(z[k],old[k]);
        if (ac && zc && !equal(a[k],z[k])) return {ok:false, reason:'The same task field was edited differently on both devices.'};
        target[k]=ac?a[k]:z[k];
      }
    }
    try{validate(result);}catch(e){return {ok:false,reason:'Scheduling edits could not be safely combined: '+e.message};}
    return {ok:true, nodes:result};
  }
  return {merge, validate, equal, clone};
});
