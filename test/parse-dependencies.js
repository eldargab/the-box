var parse = require('../lib/util').parseDeps

describe('Dependencies parsing', function () {
    it('Should determine getter name', function () {
        parse(function (req) {
            req('foo')
            req("bar")
            get('baz')
        }).should.eql(['foo', 'bar'])
    })

    it('Should ignore commented code', function () {
        parse(function (get) {
            // get('asdf')
            get('hello')
            /*
                get('foo')
            */
        }).should.eql(['hello'])
    })

    it('Should ignore object members', function () {
        parse(function (get) {
            o.get('asdf')
        }).should.eql([])
    })

    it('Should work with named functions', function () {
        parse(function fn (get) {
            get('bar')
        }).should.eql(['bar'])
    })

    it('Should work with none-getting functions', function () {
        parse(function () {
            get('bar')
        }).should.eql([])
    })
})