import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyFinalMessage} from '../extension/final-dialog.js';
test('observed UNI-PASS no-error notice is an exact validation success',()=>{
 assert.equal(classifyFinalMessage('validate','오류검증 결과 오류가 존재하지 않습니다.'),'success');
 assert.equal(classifyFinalMessage('validate','오류가 없습니다.'),'success');
 for(const text of ['오류검증 결과 오류가 존재합니다.','오류검증 결과 오류가 존재하지 않습니다. 추가 확인이 필요합니다.','오류가 없다는 뜻이 아닙니다.'])assert.notEqual(classifyFinalMessage('validate',text),'success');
 assert.notEqual(classifyFinalMessage('send','오류검증 결과 오류가 존재하지 않습니다.'),'success');
});
