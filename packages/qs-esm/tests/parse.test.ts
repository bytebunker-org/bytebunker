import { parse } from '../src/index.js';
import { decode } from '../src/utils.js';
import { emptyKeysCases } from './empty-keys-cases.js';
import { describe, expect, test } from 'vitest';

const deepEqual = (a, b, msg?: string) => expect(a).toEqual(b);

describe('parse()', () => {
    test('parses a simple string', () => {
        deepEqual(parse('0=foo'), { 0: 'foo' });
        deepEqual(parse('foo=c++'), { foo: 'c  ' });
        deepEqual(parse('a[>=]=23'), { a: { '>=': '23' } });
        deepEqual(parse('a[<=>]==23'), { a: { '<=>': '=23' } });
        deepEqual(parse('a[==]=23'), { a: { '==': '23' } });
        deepEqual(parse('foo', { strictNullHandling: true }), { foo: null });
        deepEqual(parse('foo'), { foo: '' });
        deepEqual(parse('foo='), { foo: '' });
        deepEqual(parse('foo=bar'), { foo: 'bar' });
        deepEqual(parse(' foo = bar = baz '), { ' foo ': ' bar = baz ' });
        deepEqual(parse('foo=bar=baz'), { foo: 'bar=baz' });
        deepEqual(parse('foo=bar&bar=baz'), { foo: 'bar', bar: 'baz' });
        deepEqual(parse('foo2=bar2&baz2='), { foo2: 'bar2', baz2: '' });
        deepEqual(parse('foo=bar&baz', { strictNullHandling: true }), { foo: 'bar', baz: null });
        deepEqual(parse('foo=bar&baz'), { foo: 'bar', baz: '' });
        deepEqual(parse('cht=p3&chd=t:60,40&chs=250x100&chl=Hello|World'), {
            cht: 'p3',
            chd: 't:60,40',
            chs: '250x100',
            chl: 'Hello|World'
        });
    });

    // TODO: arrayFormat not in parse options??

    /*test('arrayFormat: brackets allows only explicit arrays', () => {
        deepEqual(parse('a[]=b&a[]=c', { arrayFormat: 'brackets' }), { a: ['b', 'c'] });
        deepEqual(parse('a[0]=b&a[1]=c', { arrayFormat: 'brackets' }), { a: ['b', 'c'] });
        deepEqual(parse('a=b,c', { arrayFormat: 'brackets' }), { a: 'b,c' });
        deepEqual(parse('a=b&a=c', { arrayFormat: 'brackets' }), { a: ['b', 'c'] });
    });

    test('arrayFormat: indices allows only indexed arrays', () => {
        deepEqual(parse('a[]=b&a[]=c', { arrayFormat: 'indices' }), { a: ['b', 'c'] });
        deepEqual(parse('a[0]=b&a[1]=c', { arrayFormat: 'indices' }), { a: ['b', 'c'] });
        deepEqual(parse('a=b,c', { arrayFormat: 'indices' }), { a: 'b,c' });
        deepEqual(parse('a=b&a=c', { arrayFormat: 'indices' }), { a: ['b', 'c'] });
    });

    test('arrayFormat: comma allows only comma-separated arrays', () => {
        deepEqual(parse('a[]=b&a[]=c', { arrayFormat: 'comma' }), { a: ['b', 'c'] });
        deepEqual(parse('a[0]=b&a[1]=c', { arrayFormat: 'comma' }), { a: ['b', 'c'] });
        deepEqual(parse('a=b,c', { arrayFormat: 'comma' }), { a: 'b,c' });
        deepEqual(parse('a=b&a=c', { arrayFormat: 'comma' }), { a: ['b', 'c'] });
    });

    test('arrayFormat: repeat allows only repeated values', () => {
        deepEqual(parse('a[]=b&a[]=c', { arrayFormat: 'repeat' }), { a: ['b', 'c'] });
        deepEqual(parse('a[0]=b&a[1]=c', { arrayFormat: 'repeat' }), { a: ['b', 'c'] });
        deepEqual(parse('a=b,c', { arrayFormat: 'repeat' }), { a: 'b,c' });
        deepEqual(parse('a=b&a=c', { arrayFormat: 'repeat' }), { a: ['b', 'c'] });
    });*/

    test('allows enabling dot notation', () => {
        deepEqual(parse('a.b=c'), { 'a.b': 'c' });
        deepEqual(parse('a.b=c', { allowDots: true }), { a: { b: 'c' } });
    });

    deepEqual(parse('a[b]=c'), { a: { b: 'c' } }, 'parses a single nested string');
    deepEqual(parse('a[b][c]=d'), { a: { b: { c: 'd' } } }, 'parses a double nested string');
    deepEqual(
        parse('a[b][c][d][e][f][g][h]=i'),
        { a: { b: { c: { d: { e: { f: { '[g][h]': 'i' } } } } } } },
        'defaults to a depth of 5'
    );

    test('only parses one level when depth = 1', () => {
        deepEqual(parse('a[b][c]=d', { depth: 1 }), { a: { b: { '[c]': 'd' } } });
        deepEqual(parse('a[b][c][d]=e', { depth: 1 }), { a: { b: { '[c][d]': 'e' } } });
    });

    test('uses original key when depth = 0', () => {
        deepEqual(parse('a[0]=b&a[1]=c', { depth: 0 }), { 'a[0]': 'b', 'a[1]': 'c' });
        deepEqual(parse('a[0][0]=b&a[0][1]=c&a[1]=d&e=2', { depth: 0 }), {
            'a[0][0]': 'b',
            'a[0][1]': 'c',
            'a[1]': 'd',
            e: '2'
        });
    });

    test('uses original key when depth = false', () => {
        deepEqual(parse('a[0]=b&a[1]=c', { depth: false }), { 'a[0]': 'b', 'a[1]': 'c' });
        deepEqual(parse('a[0][0]=b&a[0][1]=c&a[1]=d&e=2', { depth: false }), {
            'a[0][0]': 'b',
            'a[0][1]': 'c',
            'a[1]': 'd',
            e: '2'
        });
    });

    deepEqual(parse('a=b&a=c'), { a: ['b', 'c'] }, 'parses a simple array');

    test('parses an explicit array', () => {
        deepEqual(parse('a[]=b'), { a: ['b'] });
        deepEqual(parse('a[]=b&a[]=c'), { a: ['b', 'c'] });
        deepEqual(parse('a[]=b&a[]=c&a[]=d'), { a: ['b', 'c', 'd'] });
    });

    test('parses a mix of simple and explicit arrays', () => {
        deepEqual(parse('a=b&a[]=c'), { a: ['b', 'c'] });
        deepEqual(parse('a[]=b&a=c'), { a: ['b', 'c'] });
        deepEqual(parse('a[0]=b&a=c'), { a: ['b', 'c'] });
        deepEqual(parse('a=b&a[0]=c'), { a: ['b', 'c'] });

        deepEqual(parse('a[1]=b&a=c', { arrayLimit: 20 }), { a: ['b', 'c'] });
        deepEqual(parse('a[]=b&a=c', { arrayLimit: 0 }), { a: ['b', 'c'] });
        deepEqual(parse('a[]=b&a=c'), { a: ['b', 'c'] });

        deepEqual(parse('a=b&a[1]=c', { arrayLimit: 20 }), { a: ['b', 'c'] });
        deepEqual(parse('a=b&a[]=c', { arrayLimit: 0 }), { a: ['b', 'c'] });
        deepEqual(parse('a=b&a[]=c'), { a: ['b', 'c'] });
    });

    test('parses a nested array', () => {
        deepEqual(parse('a[b][]=c&a[b][]=d'), { a: { b: ['c', 'd'] } });
        deepEqual(parse('a[>=]=25'), { a: { '>=': '25' } });
    });

    test('allows to specify array indices', () => {
        deepEqual(parse('a[1]=c&a[0]=b&a[2]=d'), { a: ['b', 'c', 'd'] });
        deepEqual(parse('a[1]=c&a[0]=b'), { a: ['b', 'c'] });
        deepEqual(parse('a[1]=c', { arrayLimit: 20 }), { a: ['c'] });
        deepEqual(parse('a[1]=c', { arrayLimit: 0 }), { a: { 1: 'c' } });
        deepEqual(parse('a[1]=c'), { a: ['c'] });
    });

    test('limits specific array indices to arrayLimit', () => {
        deepEqual(parse('a[20]=a', { arrayLimit: 20 }), { a: ['a'] });
        deepEqual(parse('a[21]=a', { arrayLimit: 20 }), { a: { 21: 'a' } });

        deepEqual(parse('a[20]=a'), { a: ['a'] });
        deepEqual(parse('a[21]=a'), { a: { 21: 'a' } });
    });

    deepEqual(parse('a[12b]=c'), { a: { '12b': 'c' } }, 'supports keys that begin with a number');

    test('supports encoded = signs', () => {
        deepEqual(parse('he%3Dllo=th%3Dere'), { 'he=llo': 'th=ere' });
    });

    test('is ok with url encoded strings', () => {
        deepEqual(parse('a[b%20c]=d'), { a: { 'b c': 'd' } });
        deepEqual(parse('a[b]=c%20d'), { a: { b: 'c d' } });
    });

    test('allows brackets in the value', () => {
        deepEqual(parse('pets=["tobi"]'), { pets: '["tobi"]' });
        deepEqual(parse('operators=[">=", "<="]'), { operators: '[">=", "<="]' });
    });

    test('allows empty values', () => {
        deepEqual(parse(''), {});
        deepEqual(parse(null), {});
        deepEqual(parse(undefined), {});
    });

    test('transforms arrays to objects', () => {
        deepEqual(parse('foo[0]=bar&foo[bad]=baz'), { foo: { 0: 'bar', bad: 'baz' } });
        deepEqual(parse('foo[bad]=baz&foo[0]=bar'), { foo: { bad: 'baz', 0: 'bar' } });
        deepEqual(parse('foo[bad]=baz&foo[]=bar'), { foo: { bad: 'baz', 0: 'bar' } });
        deepEqual(parse('foo[]=bar&foo[bad]=baz'), { foo: { 0: 'bar', bad: 'baz' } });
        deepEqual(parse('foo[bad]=baz&foo[]=bar&foo[]=foo'), { foo: { bad: 'baz', 0: 'bar', 1: 'foo' } });
        deepEqual(parse('foo[0][a]=a&foo[0][b]=b&foo[1][a]=aa&foo[1][b]=bb'), {
            foo: [
                { a: 'a', b: 'b' },
                { a: 'aa', b: 'bb' }
            ]
        });

        deepEqual(parse('a[]=b&a[t]=u&a[hasOwnProperty]=c', { allowPrototypes: false }), {
            a: { 0: 'b', t: 'u' }
        });
        deepEqual(parse('a[]=b&a[t]=u&a[hasOwnProperty]=c', { allowPrototypes: true }), {
            a: { 0: 'b', t: 'u', hasOwnProperty: 'c' }
        });
        deepEqual(parse('a[]=b&a[hasOwnProperty]=c&a[x]=y', { allowPrototypes: false }), {
            a: { 0: 'b', x: 'y' }
        });
        deepEqual(parse('a[]=b&a[hasOwnProperty]=c&a[x]=y', { allowPrototypes: true }), {
            a: { 0: 'b', hasOwnProperty: 'c', x: 'y' }
        });
    });

    test('transforms arrays to objects (dot notation)', () => {
        deepEqual(parse('foo[0].baz=bar&fool.bad=baz', { allowDots: true }), {
            foo: [{ baz: 'bar' }],
            fool: { bad: 'baz' }
        });
        deepEqual(parse('foo[0].baz=bar&fool.bad.boo=baz', { allowDots: true }), {
            foo: [{ baz: 'bar' }],
            fool: { bad: { boo: 'baz' } }
        });
        deepEqual(parse('foo[0][0].baz=bar&fool.bad=baz', { allowDots: true }), {
            foo: [[{ baz: 'bar' }]],
            fool: { bad: 'baz' }
        });
        deepEqual(parse('foo[0].baz[0]=15&foo[0].bar=2', { allowDots: true }), {
            foo: [{ baz: ['15'], bar: '2' }]
        });
        deepEqual(parse('foo[0].baz[0]=15&foo[0].baz[1]=16&foo[0].bar=2', { allowDots: true }), {
            foo: [{ baz: ['15', '16'], bar: '2' }]
        });
        deepEqual(parse('foo.bad=baz&foo[0]=bar', { allowDots: true }), { foo: { bad: 'baz', 0: 'bar' } });
        deepEqual(parse('foo.bad=baz&foo[]=bar', { allowDots: true }), { foo: { bad: 'baz', 0: 'bar' } });
        deepEqual(parse('foo[]=bar&foo.bad=baz', { allowDots: true }), { foo: { 0: 'bar', bad: 'baz' } });
        deepEqual(parse('foo.bad=baz&foo[]=bar&foo[]=foo', { allowDots: true }), {
            foo: { bad: 'baz', 0: 'bar', 1: 'foo' }
        });
        deepEqual(parse('foo[0].a=a&foo[0].b=b&foo[1].a=aa&foo[1].b=bb', { allowDots: true }), {
            foo: [
                { a: 'a', b: 'b' },
                { a: 'aa', b: 'bb' }
            ]
        });
    });

    test('correctly prunes undefined values when converting an array to an object', () => {
        deepEqual(parse('a[2]=b&a[99999999]=c'), { a: { 2: 'b', 99999999: 'c' } });
    });

    test('supports malformed uri characters', () => {
        deepEqual(parse('{%:%}', { strictNullHandling: true }), { '{%:%}': null });
        deepEqual(parse('{%:%}='), { '{%:%}': '' });
        deepEqual(parse('foo=%:%}'), { foo: '%:%}' });
    });

    test("doesn't produce empty keys", () => {
        deepEqual(parse('_r=1&'), { _r: '1' });
    });

    test('cannot access Object prototype', () => {
        parse('constructor[prototype][bad]=bad');
        parse('bad[constructor][prototype][bad]=bad');
        // @ts-expect-error
        expect(Object.prototype.bad).toBeUndefined();
    });

    test('parses arrays of objects', () => {
        deepEqual(parse('a[][b]=c'), { a: [{ b: 'c' }] });
        deepEqual(parse('a[0][b]=c'), { a: [{ b: 'c' }] });
    });

    test('allows for empty strings in arrays', () => {
        deepEqual(parse('a[]=b&a[]=&a[]=c'), { a: ['b', '', 'c'] });

        deepEqual(
            parse('a[0]=b&a[1]&a[2]=c&a[19]=', { strictNullHandling: true, arrayLimit: 20 }),
            { a: ['b', null, 'c', ''] },
            'with arrayLimit 20 + array indices: null then empty string works'
        );
        deepEqual(
            parse('a[]=b&a[]&a[]=c&a[]=', { strictNullHandling: true, arrayLimit: 0 }),
            { a: ['b', null, 'c', ''] },
            'with arrayLimit 0 + array brackets: null then empty string works'
        );

        deepEqual(
            parse('a[0]=b&a[1]=&a[2]=c&a[19]', { strictNullHandling: true, arrayLimit: 20 }),
            { a: ['b', '', 'c', null] },
            'with arrayLimit 20 + array indices: empty string then null works'
        );
        deepEqual(
            parse('a[]=b&a[]=&a[]=c&a[]', { strictNullHandling: true, arrayLimit: 0 }),
            { a: ['b', '', 'c', null] },
            'with arrayLimit 0 + array brackets: empty string then null works'
        );

        deepEqual(parse('a[]=&a[]=b&a[]=c'), { a: ['', 'b', 'c'] }, 'array brackets: empty strings work');
    });

    test('compacts sparse arrays', () => {
        deepEqual(parse('a[10]=1&a[2]=2', { arrayLimit: 20 }), { a: ['2', '1'] });
        deepEqual(parse('a[1][b][2][c]=1', { arrayLimit: 20 }), { a: [{ b: [{ c: '1' }] }] });
        deepEqual(parse('a[1][2][3][c]=1', { arrayLimit: 20 }), { a: [[[{ c: '1' }]]] });
        deepEqual(parse('a[1][2][3][c][1]=1', { arrayLimit: 20 }), { a: [[[{ c: ['1'] }]]] });
    });

    test('parses sparse arrays', () => {
        /* eslint no-sparse-arrays: 0 */
        deepEqual(parse('a[4]=1&a[1]=2', { allowSparse: true }), { a: [, '2', , , '1'] });
        deepEqual(parse('a[1][b][2][c]=1', { allowSparse: true }), { a: [, { b: [, , { c: '1' }] }] });
        deepEqual(parse('a[1][2][3][c]=1', { allowSparse: true }), { a: [, [, , [, , , { c: '1' }]]] });
        deepEqual(parse('a[1][2][3][c][1]=1', { allowSparse: true }), { a: [, [, , [, , , { c: [, '1'] }]]] });
    });

    test('parses semi-parsed strings', () => {
        deepEqual(parse({ 'a[b]': 'c' }), { a: { b: 'c' } });
        deepEqual(parse({ 'a[b]': 'c', 'a[d]': 'e' }), { a: { b: 'c', d: 'e' } });
    });

    /*test('parses buffers correctly', () => {
        const b = Buffer.from('test');
        deepEqual(parse({ a: b }), { a: b });
    });*/

    test('parses jquery-param strings', () => {
        // readable = 'filter[0][]=int1&filter[0][]==&filter[0][]=77&filter[]=and&filter[2][]=int2&filter[2][]==&filter[2][]=8'
        const encoded =
            'filter%5B0%5D%5B%5D=int1&filter%5B0%5D%5B%5D=%3D&filter%5B0%5D%5B%5D=77&filter%5B%5D=and&filter%5B2%5D%5B%5D=int2&filter%5B2%5D%5B%5D=%3D&filter%5B2%5D%5B%5D=8';
        const expected = { filter: [['int1', '=', '77'], 'and', ['int2', '=', '8']] };
        deepEqual(parse(encoded), expected);
    });

    test('continues parsing when no parent is found', () => {
        deepEqual(parse('[]=&a=b'), { 0: '', a: 'b' });
        deepEqual(parse('[]&a=b', { strictNullHandling: true }), { 0: null, a: 'b' });
        deepEqual(parse('[foo]=bar'), { foo: 'bar' });
    });

    test('does not error when parsing a very long array', () => {
        let str = 'a[]=a';
        while (Buffer.byteLength(str) < 128 * 1024) {
            str = str + '&' + str;
        }

        parse(str);
    });

    test('should not throw when a native prototype has an enumerable property', () => {
        // @ts-expect-error
        Object.prototype.crash = '';
        // @ts-expect-error
        Array.prototype.crash = '';
        // st.doesNotThrow(qs.parse.bind(null, 'a=b'));
        parse.bind(null, 'a=b');
        deepEqual(parse('a=b'), { a: 'b' });
        // st.doesNotThrow(qs.parse.bind(null, 'a[][b]=c'));
        parse.bind(null, 'a[][b]=c');
        deepEqual(parse('a[][b]=c'), { a: [{ b: 'c' }] });
        // @ts-expect-error
        delete Object.prototype.crash;
        // @ts-expect-error
        delete Array.prototype.crash;
    });

    test('parses a string with an alternative string delimiter', () => {
        deepEqual(parse('a=b;c=d', { delimiter: ';' }), { a: 'b', c: 'd' });
    });

    test('parses a string with an alternative RegExp delimiter', () => {
        deepEqual(parse('a=b; c=d', { delimiter: /[;,] */ }), { a: 'b', c: 'd' });
    });

    test('does not use non-splittable objects as delimiters', () => {
        // TODO: should this work?
        // deepEqual(parse('a=b&c=d', { delimiter: true }), { a: 'b', c: 'd' });
    });

    test('allows overriding parameter limit', () => {
        deepEqual(parse('a=b&c=d', { parameterLimit: 1 }), { a: 'b' });
    });

    test('allows setting the parameter limit to Infinity', () => {
        deepEqual(parse('a=b&c=d', { parameterLimit: Infinity }), { a: 'b', c: 'd' });
    });

    test('allows overriding array limit', () => {
        deepEqual(parse('a[0]=b', { arrayLimit: -1 }), { a: { 0: 'b' } });
        deepEqual(parse('a[0]=b', { arrayLimit: 0 }), { a: ['b'] });

        deepEqual(parse('a[-1]=b', { arrayLimit: -1 }), { a: { '-1': 'b' } });
        deepEqual(parse('a[-1]=b', { arrayLimit: 0 }), { a: { '-1': 'b' } });

        deepEqual(parse('a[0]=b&a[1]=c', { arrayLimit: -1 }), { a: { 0: 'b', 1: 'c' } });
        deepEqual(parse('a[0]=b&a[1]=c', { arrayLimit: 0 }), { a: { 0: 'b', 1: 'c' } });
    });

    test('allows disabling array parsing', () => {
        const indices = parse('a[0]=b&a[1]=c', { parseArrays: false });
        deepEqual(indices, { a: { 0: 'b', 1: 'c' } });
        deepEqual(Array.isArray(indices.a), false, 'parseArrays:false, indices case is not an array');

        const emptyBrackets = parse('a[]=b', { parseArrays: false });
        deepEqual(emptyBrackets, { a: { 0: 'b' } });
        deepEqual(Array.isArray(emptyBrackets.a), false, 'parseArrays:false, empty brackets case is not an array');
    });

    test('allows for query string prefix', () => {
        deepEqual(parse('?foo=bar', { ignoreQueryPrefix: true }), { foo: 'bar' });
        deepEqual(parse('foo=bar', { ignoreQueryPrefix: true }), { foo: 'bar' });
        deepEqual(parse('?foo=bar', { ignoreQueryPrefix: false }), { '?foo': 'bar' });
    });

    test('parses an object', () => {
        const input = {
            'user[name]': { 'pop[bob]': 3 },
            'user[email]': null
        };

        const expected = {
            user: {
                name: { 'pop[bob]': 3 },
                email: null
            }
        };

        const result = parse(input);

        deepEqual(result, expected);
    });

    test('parses string with comma as array divider', () => {
        deepEqual(parse('foo=bar,tee', { comma: true }), { foo: ['bar', 'tee'] });
        deepEqual(parse('foo[bar]=coffee,tee', { comma: true }), { foo: { bar: ['coffee', 'tee'] } });
        deepEqual(parse('foo=', { comma: true }), { foo: '' });
        deepEqual(parse('foo', { comma: true }), { foo: '' });
        deepEqual(parse('foo', { comma: true, strictNullHandling: true }), { foo: null });

        // test cases inversed from from stringify tests
        deepEqual(parse('a[0]=c'), { a: ['c'] });
        deepEqual(parse('a[]=c'), { a: ['c'] });
        deepEqual(parse('a[]=c', { comma: true }), { a: ['c'] });

        deepEqual(parse('a[0]=c&a[1]=d'), { a: ['c', 'd'] });
        deepEqual(parse('a[]=c&a[]=d'), { a: ['c', 'd'] });
        deepEqual(parse('a=c,d', { comma: true }), { a: ['c', 'd'] });
    });

    test('parses values with comma as array divider', () => {
        deepEqual(parse({ foo: 'bar,tee' }, { comma: false }), { foo: 'bar,tee' });
        deepEqual(parse({ foo: 'bar,tee' }, { comma: true }), { foo: ['bar', 'tee'] });
    });

    test('use number decoder, parses string that has one number with comma option enabled', () => {
        const decoder = function (str, defaultDecoder, charset, type) {
            if (!isNaN(Number(str))) {
                return parseFloat(str);
            }
            return defaultDecoder(str, defaultDecoder, charset, type);
        };

        deepEqual(parse('foo=1', { comma: true, decoder: decoder }), { foo: 1 });
        deepEqual(parse('foo=0', { comma: true, decoder: decoder }), { foo: 0 });
    });

    test('parses brackets holds array of arrays when having two parts of strings with comma as array divider', () => {
        deepEqual(parse('foo[]=1,2,3&foo[]=4,5,6', { comma: true }), {
            foo: [
                ['1', '2', '3'],
                ['4', '5', '6']
            ]
        });
        deepEqual(parse('foo[]=1,2,3&foo[]=', { comma: true }), { foo: [['1', '2', '3'], ''] });
        deepEqual(parse('foo[]=1,2,3&foo[]=,', { comma: true }), {
            foo: [
                ['1', '2', '3'],
                ['', '']
            ]
        });
        deepEqual(parse('foo[]=1,2,3&foo[]=a', { comma: true }), { foo: [['1', '2', '3'], 'a'] });
    });

    test('parses comma delimited array while having percent-encoded comma treated as normal text', () => {
        deepEqual(parse('foo=a%2Cb', { comma: true }), { foo: 'a,b' });
        deepEqual(parse('foo=a%2C%20b,d', { comma: true }), { foo: ['a, b', 'd'] });
        deepEqual(parse('foo=a%2C%20b,c%2C%20d', { comma: true }), { foo: ['a, b', 'c, d'] });
    });

    test('parses an object in dot notation', () => {
        const input = {
            'user.name': { 'pop[bob]': 3 },
            'user.email.': null
        };

        const expected = {
            user: {
                name: { 'pop[bob]': 3 },
                email: null
            }
        };

        const result = parse(input, { allowDots: true });

        deepEqual(result, expected);
    });

    test('parses an object and not child values', () => {
        const input = {
            'user[name]': { 'pop[bob]': { test: 3 } },
            'user[email]': null
        };

        const expected = {
            user: {
                name: { 'pop[bob]': { test: 3 } },
                email: null
            }
        };

        const result = parse(input);

        deepEqual(result, expected);
    });

    /*test('does not blow up when Buffer global is missing', () => {
        const tempBuffer = global.Buffer;
        delete global.Buffer;
        const result = parse('a=b&c=d');
        global.Buffer = tempBuffer;
        deepEqual(result, { a: 'b', c: 'd' });
    });*/

    test('does not crash when parsing circular references', () => {
        const a: Record<string, any> = {};
        a.b = a;

        const parsed = parse({ 'foo[bar]': 'baz', 'foo[baz]': a });

        deepEqual('foo' in parsed, true, 'parsed has "foo" property');
        // @ts-ignore
        deepEqual('bar' in parsed.foo, true);
        // @ts-ignore
        deepEqual('baz' in parsed.foo, true);
        // @ts-ignore
        deepEqual(parsed.foo.bar, 'baz');
        // @ts-ignore
        deepEqual(parsed.foo.baz, a);
    });

    test('does not crash when parsing deep objects', () => {
        let str = 'foo';

        for (let i = 0; i < 5000; i++) {
            str += '[p]';
        }

        str += '=bar';

        const parsed = parse(str, { depth: 5000 });

        deepEqual('foo' in parsed, true, 'parsed has "foo" property');

        let depth = 0;
        let ref = parsed.foo;
        // @ts-ignore
        while ((ref = ref.p)) {
            depth += 1;
        }

        deepEqual(depth, 5000, 'parsed is 5000 properties deep');
    });

    test('parses null objects correctly', /*{ skip: !Object.create }, */ () => {
        const a = Object.create(null);
        a.b = 'c';

        deepEqual(parse(a), { b: 'c' });
        const result = parse({ a: a });
        deepEqual('a' in result, true, 'result has "a" property');
        deepEqual(result.a, a);
    });

    test('parses dates correctly', () => {
        const now = new Date();
        deepEqual(parse({ a: now }), { a: now });
    });

    test('parses regular expressions correctly', () => {
        const re = /^test$/;
        deepEqual(parse({ a: re }), { a: re });
    });

    test('does not allow overwriting prototype properties', () => {
        deepEqual(parse('a[hasOwnProperty]=b', { allowPrototypes: false }), {});
        deepEqual(parse('hasOwnProperty=b', { allowPrototypes: false }), {});

        deepEqual(parse('toString', { allowPrototypes: false }), {}, 'bare "toString" results in {}');
    });

    test('can allow overwriting prototype properties', () => {
        deepEqual(parse('a[hasOwnProperty]=b', { allowPrototypes: true }), { a: { hasOwnProperty: 'b' } });
        deepEqual(parse('hasOwnProperty=b', { allowPrototypes: true }), { hasOwnProperty: 'b' });

        deepEqual(
            parse('toString', { allowPrototypes: true }),
            { toString: '' },
            'bare "toString" results in { toString: "" }'
        );
    });

    /*test(
        'does not crash when the global Object prototype is frozen',
        { skip: !hasPropertyDescriptors || !hasOverrideMistake },
        () => {
            // We can't actually freeze the global Object prototype as that will interfere with other tests, and once an object is frozen, it
            // can't be unfrozen. Instead, we add a new non-writable property to simulate this.
            st.teardown(
                mockProperty(Object.prototype, 'frozenProp', { value: 'foo', nonWritable: true, nonEnumerable: true })
            );

            st['throws'](
                function () {
                    const obj = {};
                    obj.frozenProp = 'bar';
                },
                // node < 6 has a different error message
                /^TypeError: Cannot assign to read only property 'frozenProp' of (?:object '#<Object>'|#<Object>)/,
                'regular assignment of an inherited non-writable property throws'
            );

            let parsed;
            st.doesNotThrow(function () {
                parsed = parse('frozenProp', { allowPrototypes: false });
            }, 'parsing a nonwritable Object.prototype property does not throw');

            deepEqual(parsed, {}, 'bare "frozenProp" results in {}');
        }
    );*/

    test('params starting with a closing bracket', () => {
        deepEqual(parse(']=toString'), { ']': 'toString' });
        deepEqual(parse(']]=toString'), { ']]': 'toString' });
        deepEqual(parse(']hello]=toString'), { ']hello]': 'toString' });
    });

    test('params starting with a starting bracket', () => {
        deepEqual(parse('[=toString'), { '[': 'toString' });
        deepEqual(parse('[[=toString'), { '[[': 'toString' });
        deepEqual(parse('[hello[=toString'), { '[hello[': 'toString' });
    });

    test('add keys to objects', () => {
        deepEqual(parse('a[b]=c&a=d'), { a: { b: 'c', d: true } }, 'can add keys to objects');

        deepEqual(parse('a[b]=c&a=toString'), { a: { b: 'c' } }, 'can not overwrite prototype');

        deepEqual(
            parse('a[b]=c&a=toString', { allowPrototypes: true }),
            { a: { b: 'c', toString: true } },
            'can overwrite prototype with allowPrototypes true'
        );

        deepEqual(
            parse('a[b]=c&a=toString', { plainObjects: true }),
            { __proto__: null, a: { __proto__: null, b: 'c', toString: true } },
            'can overwrite prototype with plainObjects true'
        );
    });

    test('dunder proto is ignored', () => {
        const payload = 'categories[__proto__]=login&categories[__proto__]&categories[length]=42';
        const result = parse(payload, { allowPrototypes: true });

        deepEqual(
            result,
            {
                categories: {
                    length: '42'
                }
            },
            'silent [[Prototype]] payload'
        );

        const plainResult = parse(payload, { allowPrototypes: true, plainObjects: true });

        deepEqual(
            plainResult,
            {
                __proto__: null,
                categories: {
                    __proto__: null,
                    length: '42'
                }
            },
            'silent [[Prototype]] payload: plain objects'
        );

        const query = parse('categories[__proto__]=cats&categories[__proto__]=dogs&categories[some][json]=toInject', {
            allowPrototypes: true
        });

        expect(Array.isArray(query.categories)).toBeFalsy();
        expect(query.categories instanceof Array).toBeFalsy();
        deepEqual(query.categories, { some: { json: 'toInject' } });
        deepEqual(JSON.stringify(query.categories), '{"some":{"json":"toInject"}}', 'stringifies as a non-array');

        deepEqual(
            parse('foo[__proto__][hidden]=value&foo[bar]=stuffs', { allowPrototypes: true }),
            {
                foo: {
                    bar: 'stuffs'
                }
            },
            'hidden values'
        );

        deepEqual(
            parse('foo[__proto__][hidden]=value&foo[bar]=stuffs', { allowPrototypes: true, plainObjects: true }),
            {
                __proto__: null,
                foo: {
                    __proto__: null,
                    bar: 'stuffs'
                }
            },
            'hidden values: plain objects'
        );
    });

    test('can return null objects', /*{ skip: !Object.create }, */ () => {
        const expected = Object.create(null);
        expected.a = Object.create(null);
        expected.a.b = 'c';
        expected.a.hasOwnProperty = 'd';
        deepEqual(parse('a[b]=c&a[hasOwnProperty]=d', { plainObjects: true }), expected);
        deepEqual(parse(null, { plainObjects: true }), Object.create(null));
        const expectedArray = Object.create(null);
        expectedArray.a = Object.create(null);
        expectedArray.a[0] = 'b';
        expectedArray.a.c = 'd';
        deepEqual(parse('a[]=b&a[c]=d', { plainObjects: true }), expectedArray);
    });

    /*test('can parse with custom encoding', () => {
        deepEqual(
            parse('%8c%a7=%91%e5%8d%e3%95%7b', {
                decoder: function (str) {
                    const reg = /%([0-9A-F]{2})/gi;
                    const result = [];
                    let parts = reg.exec(str);
                    while (parts) {
                        result.push(parseInt(parts[1], 16));
                        parts = reg.exec(str);
                    }
                    return String(iconv.decode(SaferBuffer.from(result), 'shift_jis'));
                }
            }),
            { 県: '大阪府' }
        );
    });*/

    test('receives the default decoder as a second argument', () => {
        // st.plan(1);
        parse('a', {
            decoder: function (str, defaultDecoder) {
                deepEqual(defaultDecoder, decode);
            }
        });
    });

    test('throws error with wrong decoder', () => {
        expect(() => {
            // @ts-expect-error
            parse({}, { decoder: 'string' });
        }).toThrow(new TypeError('Decoder has to be a function.'));
    });

    test('does not mutate the options argument', () => {
        const options = {};
        parse('a[b]=true', options);
        deepEqual(options, {});
    });

    test('throws if an invalid charset is specified', () => {
        expect(() => {
            // @ts-expect-error
            parse('a=b', { charset: 'foobar' });
        }).toThrow(new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined'));
    });

    test('parses an iso-8859-1 string if asked to', () => {
        deepEqual(parse('%A2=%BD', { charset: 'iso-8859-1' }), { '¢': '½' });
    });

    const urlEncodedCheckmarkInUtf8 = '%E2%9C%93';
    const urlEncodedOSlashInUtf8 = '%C3%B8';
    const urlEncodedNumCheckmark = '%26%2310003%3B';
    const urlEncodedNumSmiley = '%26%239786%3B';

    test('prefers an utf-8 charset specified by the utf8 sentinel to a default charset of iso-8859-1', () => {
        deepEqual(
            parse('utf8=' + urlEncodedCheckmarkInUtf8 + '&' + urlEncodedOSlashInUtf8 + '=' + urlEncodedOSlashInUtf8, {
                charsetSentinel: true,
                charset: 'iso-8859-1'
            }),
            { ø: 'ø' }
        );
    });

    test('prefers an iso-8859-1 charset specified by the utf8 sentinel to a default charset of utf-8', () => {
        deepEqual(
            parse('utf8=' + urlEncodedNumCheckmark + '&' + urlEncodedOSlashInUtf8 + '=' + urlEncodedOSlashInUtf8, {
                charsetSentinel: true,
                charset: 'utf-8'
            }),
            { 'Ã¸': 'Ã¸' }
        );
    });

    test('does not require the utf8 sentinel to be defined before the parameters whose decoding it affects', () => {
        deepEqual(
            parse('a=' + urlEncodedOSlashInUtf8 + '&utf8=' + urlEncodedNumCheckmark, {
                charsetSentinel: true,
                charset: 'utf-8'
            }),
            { a: 'Ã¸' }
        );
    });

    test('should ignore an utf8 sentinel with an unknown value', () => {
        deepEqual(
            parse('utf8=foo&' + urlEncodedOSlashInUtf8 + '=' + urlEncodedOSlashInUtf8, {
                charsetSentinel: true,
                charset: 'utf-8'
            }),
            { ø: 'ø' }
        );
    });

    test('uses the utf8 sentinel to switch to utf-8 when no default charset is given', () => {
        deepEqual(
            parse('utf8=' + urlEncodedCheckmarkInUtf8 + '&' + urlEncodedOSlashInUtf8 + '=' + urlEncodedOSlashInUtf8, {
                charsetSentinel: true
            }),
            { ø: 'ø' }
        );
    });

    test('uses the utf8 sentinel to switch to iso-8859-1 when no default charset is given', () => {
        deepEqual(
            parse('utf8=' + urlEncodedNumCheckmark + '&' + urlEncodedOSlashInUtf8 + '=' + urlEncodedOSlashInUtf8, {
                charsetSentinel: true
            }),
            { 'Ã¸': 'Ã¸' }
        );
    });

    test('interprets numeric entities in iso-8859-1 when `interpretNumericEntities`', () => {
        deepEqual(parse('foo=' + urlEncodedNumSmiley, { charset: 'iso-8859-1', interpretNumericEntities: true }), {
            foo: '☺'
        });
    });

    test('handles a custom decoder returning `null`, in the `iso-8859-1` charset, when `interpretNumericEntities`', () => {
        deepEqual(
            parse('foo=&bar=' + urlEncodedNumSmiley, {
                charset: 'iso-8859-1',
                decoder: function (str, defaultDecoder, charset) {
                    return str ? defaultDecoder(str, defaultDecoder, charset) : null;
                },
                interpretNumericEntities: true
            }),
            { foo: null, bar: '☺' }
        );
    });

    test('does not interpret numeric entities in iso-8859-1 when `interpretNumericEntities` is absent', () => {
        deepEqual(parse('foo=' + urlEncodedNumSmiley, { charset: 'iso-8859-1' }), { foo: '&#9786;' });
    });

    test('does not interpret numeric entities when the charset is utf-8, even when `interpretNumericEntities`', () => {
        deepEqual(parse('foo=' + urlEncodedNumSmiley, { charset: 'utf-8', interpretNumericEntities: true }), {
            foo: '&#9786;'
        });
    });

    test('does not interpret %uXXXX syntax in iso-8859-1 mode', () => {
        deepEqual(parse('%u263A=%u263A', { charset: 'iso-8859-1' }), { '%u263A': '%u263A' });
    });

    test('allows for decoding keys and values differently', () => {
        const decoder = function (str, defaultDecoder, charset, type) {
            if (type === 'key') {
                return defaultDecoder(str, defaultDecoder, charset, type).toLowerCase();
            }
            if (type === 'value') {
                return defaultDecoder(str, defaultDecoder, charset, type).toUpperCase();
            }
            throw 'this should never happen! type: ' + type;
        };

        deepEqual(parse('KeY=vAlUe', { decoder: decoder }), { key: 'VALUE' });
    });
});

describe('parses empty keys', () => {
    emptyKeysCases.forEach((testCase) => {
        test('skips empty string key with ' + testCase.input, () => {
            deepEqual(parse(testCase.input), testCase.noEmptyKeys);
        });
    });
});
