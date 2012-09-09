var resolve = require('../lib/util').resolvePath

describe('util.pathResolve(from, to)', function () {
  test('a/b', 'c/d', 'c/d')
  test('a/b', './c', 'a/b/c')
  test('a/b', '../c', 'a/c')
  test('a/b', './c/./d/..', 'a/b/c')
  test('', '', '')
})

function test (from, to, res) {
  it(from + ' -> ' + to + ' = ' + res, function () {
    resolve(from, to).should.equal(res)
  })
}