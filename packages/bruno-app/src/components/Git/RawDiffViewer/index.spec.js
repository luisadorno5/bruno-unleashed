import { parseUnifiedDiff } from './index';

describe('parseUnifiedDiff', () => {
  it('returns an empty array for empty or invalid input', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff(null)).toEqual([]);
  });

  it('parses unified diff hunks with accurate old and new line numbers', () => {
    const sampleDiff = [
      'diff --git a/get-user.bru b/get-user.bru',
      'index 1111111..2222222 100644',
      '--- a/get-user.bru',
      '+++ b/get-user.bru',
      '@@ -10,4 +10,5 @@ meta {',
      '   name: Get User',
      '-  type: http',
      '+  type: http',
      '+  seq: 2',
      ' }'
    ].join('\n');

    const parsed = parseUnifiedDiff(sampleDiff);
    expect(parsed).toEqual([
      {
        type: 'meta',
        prefix: '',
        content: 'diff --git a/get-user.bru b/get-user.bru',
        oldNum: '',
        newNum: ''
      },
      {
        type: 'meta',
        prefix: '',
        content: 'index 1111111..2222222 100644',
        oldNum: '',
        newNum: ''
      },
      {
        type: 'meta',
        prefix: '',
        content: '--- a/get-user.bru',
        oldNum: '',
        newNum: ''
      },
      {
        type: 'meta',
        prefix: '',
        content: '+++ b/get-user.bru',
        oldNum: '',
        newNum: ''
      },
      {
        type: 'hunk',
        prefix: '@@',
        content: '@@ -10,4 +10,5 @@ meta {',
        oldNum: '...',
        newNum: '...'
      },
      {
        type: 'context',
        prefix: ' ',
        content: '  name: Get User',
        oldNum: 10,
        newNum: 10
      },
      {
        type: 'deleted',
        prefix: '-',
        content: '  type: http',
        oldNum: 11,
        newNum: ''
      },
      {
        type: 'added',
        prefix: '+',
        content: '  type: http',
        oldNum: '',
        newNum: 11
      },
      {
        type: 'added',
        prefix: '+',
        content: '  seq: 2',
        oldNum: '',
        newNum: 12
      },
      {
        type: 'context',
        prefix: ' ',
        content: '}',
        oldNum: 12,
        newNum: 13
      }
    ]);
  });
});
