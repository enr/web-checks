import { describe, expect, test } from 'vitest';
import { findDuplicateKeys } from '../../src/checks/tier0/manifest/duplicate-keys.js';

describe('findDuplicateKeys', () => {
  test('no duplicates on a clean object', () => {
    expect(findDuplicateKeys('{"a":1,"b":2}')).toEqual([]);
  });
  test('detects a top-level duplicate', () => {
    expect(findDuplicateKeys('{"name":"a","name":"b"}')).toEqual(['name']);
  });
  test('same key in different nested objects is not a duplicate', () => {
    expect(findDuplicateKeys('{"a":{"x":1},"b":{"x":2}}')).toEqual([]);
  });
  test('a key equal to a string VALUE elsewhere is not a duplicate', () => {
    expect(findDuplicateKeys('{"a":"name","name":1}')).toEqual([]);
  });
  test('handles escaped quotes inside string values', () => {
    expect(findDuplicateKeys('{"a":"he said \\"hi\\"","a":2}')).toEqual(['a']);
  });
  test('duplicate inside an array element object', () => {
    expect(findDuplicateKeys('{"icons":[{"src":"a","src":"b"}]}')).toEqual(['icons.src']);
  });
});
