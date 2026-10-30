import test from 'node:test';import assert from 'node:assert/strict';
import {createJournal} from '../extension/new-journal.js';
import {representativeItem,ingredientPlan} from '../extension/new-plan.js';
test('lost response reconciles actual committed result without a second mutation',async()=>{
 const state={},saved=[];let actual=false,clicks=0;const step=createJournal({state,persist:async()=>saved.push(structuredClone(state)),log:()=>{}});
 await assert.rejects(step('add',async()=>({done:actual}),async()=>{clicks++;actual=true;throw Error('lost');}),/lost/);
 assert.equal(saved[0].steps.add.status,'pending');await step('add',async()=>({done:actual}),async()=>clicks++);assert.equal(clicks,1);assert.equal(state.steps.add.status,'done');
});
test('ambiguous pending add does not replay; committed output altered is blocked',async()=>{
 const state={steps:{add:{status:'pending'}}};let clicks=0;const step=createJournal({state,persist:async()=>{},log:()=>{}});
 await assert.rejects(step('add',async()=>({done:false}),async()=>clicks++),/다시 누르지/);assert.equal(clicks,0);
 state.steps.add.status='done';await assert.rejects(step('add',async()=>({done:false}),async()=>clicks++),/변경/);
});
test('representative uses manufacture date, explicit selection, never expiry order',()=>{
 assert.equal(representativeItem([{제조일자:'2026-10-01',소비기한:'2027-01-01'},{제조일자:'2026-09-01',소비기한:'2028-01-01'}]),1);
 assert.equal(representativeItem([{대표품목:'예'},{}]),0);assert.throws(()=>representativeItem([{},{}]),/제조일자/);assert.throws(()=>representativeItem([{대표품목:'예'},{대표품목:'예'}]),/한 건/);
});
test('ingredient parents precede children, cycles and missing references rejected',()=>{
 const r=[{성분ID:'child',상위성분ID:'parent'},{성분ID:'parent'}];assert.deepEqual(ingredientPlan(r).map(r=>r.성분ID),['parent','child']);
 assert.throws(()=>ingredientPlan([{성분ID:'a',상위성분ID:'b'}]),/상위 성분/);assert.throws(()=>ingredientPlan([{성분ID:'a',상위성분ID:'b'},{성분ID:'b',상위성분ID:'a'}]),/순환/);
});
