import { merge } from '../src/js';
import { describe, expect, test } from 'vitest';

/*const test = require('tape');
const inspect = require('object-inspect');
const SaferBuffer = require('safer-buffer').Buffer;
const forEach = require('for-each');
const utils = require('../lib/utils');*/

test('merge()', function (t) {
    expect(merge(null, true)).toEqual([null, true], 'merges true into null');

    t.deepEqual(merge(null, [42]), [null, 42], 'merges null into an array');

    t.deepEqual(merge({ a: 'b' }, { a: 'c' }), { a: ['b', 'c'] }, 'merges two objects with the same key');

    const oneMerged = merge({ foo: 'bar' }, { foo: { first: '123' } });
    t.deepEqual(oneMerged, { foo: ['bar', { first: '123' }] }, 'merges a standalone and an object into an array');

    const twoMerged = merge({ foo: ['bar', { first: '123' }] }, { foo: { second: '456' } });
    t.deepEqual(
        twoMerged,
        { foo: { 0: 'bar', 1: { first: '123' }, second: '456' } },
        'merges a standalone and two objects into an array'
    );

    const sandwiched = merge({ foo: ['bar', { first: '123', second: '456' }] }, { foo: 'baz' });
    t.deepEqual(
        sandwiched,
        { foo: ['bar', { first: '123', second: '456' }, 'baz'] },
        'merges an object sandwiched by two standalones into an array'
    );

    const nestedArrays = merge({ foo: ['baz'] }, { foo: ['bar', 'xyzzy'] });
    t.deepEqual(nestedArrays, { foo: ['baz', 'bar', 'xyzzy'] });

    const noOptionsNonObjectSource = merge({ foo: 'baz' }, 'bar');
    t.deepEqual(noOptionsNonObjectSource, { foo: 'baz', bar: true });

    t.test(
        'avoids invoking array setters unnecessarily',
        { skip: typeof Object.defineProperty !== 'function' },
        function (st) {
            let setCount = 0;
            let getCount = 0;
            const observed = [];
            Object.defineProperty(observed, 0, {
                get: function () {
                    getCount += 1;
                    return { bar: 'baz' };
                },
                set: function () {
                    setCount += 1;
                }
            });
            merge(observed, [null]);
            st.equal(setCount, 0);
            st.equal(getCount, 1);
            observed[0] = observed[0]; // eslint-disable-line no-self-assign
            st.equal(setCount, 1);
            st.equal(getCount, 2);
            st.end();
        }
    );

    t.end();
});

test('assign()', function (t) {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    const result = assign(target, source);

    expect(result).toEqual(target);
    t.deepEqual(target, { a: 1, b: 3, c: 4 }, 'target and source are merged');
    t.deepEqual(source, { b: 3, c: 4 }, 'source is untouched');

    t.end();
});

describe('combine()', function (t) {
    t.test('both arrays', function (st) {
        const a = [1];
        const b = [2];
        const combined = combine(a, b);

        st.deepEqual(a, [1], 'a is not mutated');
        st.deepEqual(b, [2], 'b is not mutated');
        st.notEqual(a, combined, 'a !== combined');
        st.notEqual(b, combined, 'b !== combined');
        st.deepEqual(combined, [1, 2], 'combined is a + b');

        st.end();
    });

    test('one array, one non-array', function (st) {
        const aN = 1;
        const a = [aN];
        const bN = 2;
        const b = [bN];

        const combinedAnB = combine(aN, b);
        st.deepEqual(b, [bN], 'b is not mutated');
        st.notEqual(aN, combinedAnB, 'aN + b !== aN');
        st.notEqual(a, combinedAnB, 'aN + b !== a');
        st.notEqual(bN, combinedAnB, 'aN + b !== bN');
        st.notEqual(b, combinedAnB, 'aN + b !== b');
        st.deepEqual([1, 2], combinedAnB, 'first argument is array-wrapped when not an array');

        const combinedABn = combine(a, bN);
        st.deepEqual(a, [aN], 'a is not mutated');
        st.notEqual(aN, combinedABn, 'a + bN !== aN');
        st.notEqual(a, combinedABn, 'a + bN !== a');
        st.notEqual(bN, combinedABn, 'a + bN !== bN');
        st.notEqual(b, combinedABn, 'a + bN !== b');
        st.deepEqual([1, 2], combinedABn, 'second argument is array-wrapped when not an array');

        st.end();
    });

    t.test('neither is an array', function (st) {
        const combined = combine(1, 2);
        st.notEqual(1, combined, '1 + 2 !== 1');
        st.notEqual(2, combined, '1 + 2 !== 2');
        st.deepEqual([1, 2], combined, 'both arguments are array-wrapped when not an array');

        st.end();
    });

    t.end();
});

test('isBuffer()', function (t) {
    forEach([null, undefined, true, false, '', 'abc', 42, 0, NaN, {}, [], function () {}, /a/g], function (x) {
        t.equal(isBuffer(x), false, inspect(x) + ' is not a buffer');
    });

    const fakeBuffer = { constructor: Buffer };
    t.equal(isBuffer(fakeBuffer), false, 'fake buffer is not a buffer');

    const saferBuffer = SaferBuffer.from('abc');
    t.equal(isBuffer(saferBuffer), true, 'SaferBuffer instance is a buffer');

    const buffer = Buffer.from && Buffer.alloc ? Buffer.from('abc') : new Buffer('abc');
    t.equal(isBuffer(buffer), true, 'real Buffer instance is a buffer');
    t.end();
});
