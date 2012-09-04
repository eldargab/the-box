var resolve = require('../lib/util').resolvePath

describe('Path resolve', function () {
    test('a/b/c', 'd/f', 'd/f')
    test('a/b/c', './f', 'a/b/f')
    test('a/b/c', '../g', 'a/g')
    test('a/b/c', '&/d', 'a/b/c/d')
    test('a/b', '&/c/./d', 'a/b/c/d')
    test('a', '&/b/../c', 'a/c')
    test('', '&/a', 'a')
})

function test (from, to, res) {
    it(from + ' -> ' + to + '= ' + res, function () {
        resolve(from, to).should.equal(res)
    })
}