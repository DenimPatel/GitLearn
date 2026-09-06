import { describe, expect, it } from 'vitest';
import { hashObject } from '../objects';
import { sha1, utf8Bytes } from '../sha1';

describe('sha1', () => {
  it('matches known digests', () => {
    expect(sha1(utf8Bytes(''))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(sha1(utf8Bytes('abc'))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1(utf8Bytes('The quick brown fox jumps over the lazy dog')))
      .toBe('2fd4e1c67a2d28fced849ee1bb76e7391b93eb12');
  });

  it('hashes a blob exactly as real git does', () => {
    // $ printf 'hello\n' | git hash-object --stdin
    expect(hashObject({ type: 'blob', content: 'hello\n' }))
      .toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    // $ printf '' | git hash-object --stdin
    expect(hashObject({ type: 'blob', content: '' }))
      .toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  });
});
