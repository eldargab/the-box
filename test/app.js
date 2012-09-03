var sinon = require('sinon')
var should = require('should')
var App = require('../lib/app')

describe('App', function () {
    var app, cb

    beforeEach(function () {
        app = new App
        cb = sinon.spy()
        cb.hasValue = function (val) {
            this.calledOnce.should.be.true
            this.calledWithExactly(val)
        }
    })

    describe('.eval(box, cb)', function () {
        it('Throws if box is not defined', function () {
            ;(function () {
                app.eval('hi', cb)
            }).should.throw()
        })

        it('Calls box function to get actual value', function () {
            var fn = sinon.stub().returns('bar')

            app.on('foo', fn).eval('foo', cb)

            fn.calledOnce.should.be.true
            cb.hasValue('foo', 'bar')
        })

        it('If box function has arity greater then one, it is async', function () {
            var done

            app.on('foo', function (get, _done) {
                done = _done
            }).eval('foo', cb)

            cb.called.should.be.false
            done(null, 'done')
            cb.hasValue('done')
        })

        it('Box function can get values of other boxes via getter passed in the first param', function () {
            app.on('foo', function (get) {
                return get('bar') + get('baz')
            }).on('bar', function () {
                return 'bar'
            }).on('baz', function () {
                return 'baz'
            }).eval('bar').eval('baz').eval('foo', cb)
            cb.hasValue('barbaz')
        })

        it('The getter passed to the box is relative to it`s path', function () {
            function def (val) {
                app.on(val, function () {
                    return val
                }).eval(val)
            }

            def('a/b'); def('a/b/d'); def('a/b/c/d'); def('a/x/y')

            app.on('a/b/c', function (get) {
                return [
                    get('a/b'),
                    get('./d'),
                    get('&/d'),
                    get('../x/./y')
                ].join(' ')
            }).eval('a/b/c', cb)

            cb.hasValue('a/b a/b/d a/b/c/d a/x/y')
        })

        it('Evaluates all box dependencies before evaluating box itself', function () {
            var a, xxb, xc

            app.on('a', ['x/x/b', 'x/c'], function (_, done) {
                a = done
            }).on('x/x/b', ['../c'], function (_, done) {
                xxb = done
            }).on('x/c', function (_, done) {
                xc = done
            }).eval('a', cb)

            should.not.exist(xxb)
            xc()
            should.not.exist(a)
            xxb()
            a()
            cb.hasValue()
        })
    })

    describe('.set(key, val)', function () {
        it('Defines evaluated box `key` holding `val`', function () {
            app.set('greeting', 'hello').eval('greeting', cb)
            cb.hasValue('hello')
        })
    })

    describe('.get(key)', function () {
        it('Gets the value of evaluated box', function () {
            app.set('foo', 'foo')
            app.on('bar', function () {return 'bar'}).eval('bar')

            app.get('foo').should.equal('foo')
            app.get('bar').should.equal('bar')
        })

        it('Throws if box is undefined', function () {
            ;(function () {
                app.get('undefined')
            }).should.throw()
        })

        it('Throws if box is not evaluated', function () {
            app.on('baz', function () {})

            ;(function () {
                app.get('baz')
            }).should.throw()
        })
    })

    describe('.run()', function () {
        it('Creates new app instance with everything been inherited', function () {
            var launched = app
            .set('foo', 'foo')
            .on('bar', function () {
                return 'bar'
            })
            .eval('bar')
            .run()

            launched.get('bar').should.equal('bar')
            launched.get('foo').should.equal('foo')
            launched.set('hello', 'world')
            launched.isReady('hello').should.be.true
            app.isReady('hello').should.be.false
        })

        it('Launches evaluation of passed task', function () {
            app.on('hello', function () {
                return 'hello'
            }).run('hello').get('hello').should.be.equal('hello')
        })
    })

     describe('.prefix(root)', function () {
        it('Creates proxy which resolves all paths relative to `root`', function () {
            var proxy = app.prefix('root')

            app.set('root/foo', 'foo')
            proxy.get('&/foo').should.equal('foo')

            proxy.set('&/baz', 'baz')
            app.get('root/baz').should.equal('baz')

            app.set('hi', 'hi')
            proxy.get('hi').should.equal('hi')
            proxy.isReady('./hi').should.be.true

            proxy.on('&/hello', function (get) {
                return get('&/world') + ' ' + get('./people')
            })
            app.set('root/hello/world', 'world')
            proxy.set('&/people', 'people')
            proxy.eval('&/hello')
            app.get('root/hello').should.equal('world people')
        })
     })

    describe('Error handling', function () {
        it('Exeptions from boxes are catched', function () {
            var onerror = sinon.spy()
            app.onerror(onerror)

            app.on('hello', function () {
                throw 'Hello error'
            })

            app.eval('hello', cb)

            onerror.calledWith('Hello error').should.be.true
            cb.called.should.be.false
        })

        it('Supports async errors', function () {
            var onerror = sinon.spy()
            app.onerror(onerror)

            app.on('hello', function (_, done) {
                done('Hello error')
            })

            app.eval('hello', cb)
            onerror.calledWith('Hello error').should.be.true
            cb.called.should.be.false
        })

        it('Errors are bubbling', function () {
            app.on('hello/world/path', function () {
                throw 'error'
            })

            var calls = ''

            app.onerror('hello/world/path', function (err) {
                err.should.equal('error')
                calls += '1'
                throw '1'
            })

            app.onerror('hello/world', function (err, raise) {
                err.should.equal('1')
                calls += '2'
                raise('2')
            })

            app.onerror('hello', function (err, raise) {
                err.should.equal('2')
                calls += '3'
            })

            app.onerror(function (err) {
                should.fail("Shouldn't be called since we are not rethrowing in the child handler")
            })

            app.eval('hello/world/path')

            calls.should.equal('123')
        })

        it('`raise` function passed to the handler can be used as a node style callback', function () {
            app.on('hello', function () {
                throw 'Hello error'
            })

            app.onerror('hello', function (err, raise) {
                raise(null, err)
            })

            app.onerror(cb)
            app.eval('hello')
            cb.called.should.be.false
        })

        it('Errors of the app level handler are throwed', function () {
            app.on('hello', function () {
                throw 'hello'
            })

            app.onerror(function (err, raise) {
                raise(new Error('bam!'))
            })

            ;(function () {
                app.eval('hello')
            }).should.throw('bam!')
        })

        it('`this` of the handler is set to the current path`s proxy', function (done) {
            app.set('foo/bar', 'bar')

            app.on('foo', function () {
                throw 'error'
            })

            app.onerror('foo', function (err) {
                this.get('&/bar').should.equal('bar')
                throw err
            })

            app.onerror(function () {
                this.should.equal(app)
                done()
            })

            app.eval('foo')
        })
    })
})