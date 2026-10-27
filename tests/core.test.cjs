const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../extension/core.js');

test('conversation identities exclude other origins and non-history routes', () => {
  assert.equal(C.conversationId('/c/abc-123'), 'abc-123');
  assert.equal(C.conversationId('https://chatgpt.com/c/abc-123?x=1'), 'abc-123');
  for (const href of ['https://evil.example/c/abc', '//evil.example/c/abc', '/share/abc', '/g/project', '/c/abc/edit', '/c/', 'javascript:alert(1)']) {
    assert.equal(C.conversationId(href), null, href);
  }
});

test('only explicit supported menu labels can authorize an action', () => {
  for (const label of ['Delete', 'Delete chat', '삭제', '대화 삭제', '삭제…']) assert.equal(C.isAction(label, 'delete'), true);
  for (const label of ['Archive', '보관', '보관하기']) assert.equal(C.isAction(label, 'archive'), true);
  for (const label of ['Delete all chats', '모든 대화 삭제', 'Do not delete', 'Unarchive', '보관 취소', 'Delete forever?', '']) {
    assert.equal(C.isAction(label, 'delete'), false, label);
    assert.equal(C.isAction(label, 'archive'), false, label);
  }
  assert.equal(C.isAction('Delete', 'unsupported'), false);
});

test('Korean and case-insensitive title search preserves exact titles', () => {
  const items = [{ id: 'a', title: '연구 계획' }, { id: 'b', title: 'Project ABC' }, { id: 'c', title: '<img src=x onerror=alert(1)>' }];
  assert.deepEqual(C.filtered(items, '연구').map((i) => i.id), ['a']);
  assert.deepEqual(C.filtered(items, 'ＡＢＣ').map((i) => i.id), ['b']);
  assert.equal(C.filtered(items, '<img')[0].title, items[2].title);
});

test('execution snapshot excludes unselected IDs and is detached from live list', () => {
  const items = [{ id: 'a', title: 'Keep' }, { id: 'b', title: 'Selected' }];
  const selected = new Set(['b', 'not-in-current-list']);
  const result = C.selectedSnapshot(items, selected);
  items[1].title = 'Renamed';
  selected.add('a');
  assert.deepEqual(result, [{ id: 'b', title: 'Selected' }]);
  assert.equal(Object.isFrozen(result[0]), true);
});

test('current plain Korean delete paragraph must name the exact title', () => {
  assert.equal(C.dialogNamesTitle('이 작업은 연구 메모을(를) 영구적으로 삭제합니다. 되돌릴 수 없습니다.', '연구 메모'), true);
  assert.equal(C.dialogNamesTitle('이 작업은 연구 메모 복사본을(를) 영구적으로 삭제합니다. 되돌릴 수 없습니다.', '연구 메모'), false);
  assert.equal(C.dialogNamesTitle('이 작업은 다른 대화을(를) 영구적으로 삭제합니다. 되돌릴 수 없습니다.', '연구 메모'), false);
  assert.equal(C.dialogNamesTitle('This will permanently delete Notes. This action cannot be undone.', 'Notes'), true);
  assert.equal(C.dialogNamesTitle('“Notes extended”', 'Notes'), false);
  assert.equal(C.dialogNamesTitle('“Notes”', 'Notes'), true);
  assert.equal(C.dialogNamesTitle('anything', ''), false);
});
