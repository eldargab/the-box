var sinon = require('sinon')
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

      app.def('foo', fn).eval('foo', cb)

      fn.calledOnce.should.be.true
      cb.hasValue('foo', 'bar')
    })

    it('If box function has arity greater then one, it is async', function () {
      var done

      app.def('foo', function (get, _done) {
        done = _done
      }).eval('foo', cb)

      cb.called.should.be.false
      done(null, 'done')
      cb.hasValue('done')
    })

    it('Box function can get values of other boxes via getter passed in the first param', function () {
      app.def('foo', function (get) {
        return get('bar') + get('baz')
      }).def('bar', function () {
        return 'bar'
      }).def('baz', function () {
        return 'baz'
      }).eval('bar').eval('baz').eval('foo', cb)
      cb.hasValue('barbaz')
    })

    it('The getter passed to the box is relative to it`s path', function () {
      function def (val) {
        app.def(val, function () {
          return val
        }).eval(val)
      }

      def('a/b'); def('a/b/d'); def('a/b/c/d'); def('a/x/y')

      app.def('a/b/c', function (get) {
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

      app.def('a', ['x/x/b', 'x/c'], function (_, done) {
        a = done
      }).def('x/x/b', ['../c'], function (_, done) {
        xxb = done
      }).def('x/c', function (_, done) {
        xc = done
      }).eval('a', cb)

      assert.not.exist(xxb)
      xc()
      assert.not.exist(a)
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
      app.def('bar', function () {return 'bar'}).eval('bar')

      app.get('foo').should.equal('foo')
      app.get('bar').should.equal('bar')
    })

    it('Returns undefined if box is not defined', function () {
      assert.not.exist(app.get('undefined'))
    })

    it('Returns undefined if box is not evaluated', function () {
      app.def('baz', function (get, done) {})
      app.def('bar', function () {})

      app.eval('baz')

      assert.not.exist(app.get('baz'))
      assert.not.exist(app.get('bar'))
    })
  })

  describe('.run()', function () {
    it('Creates new app instance with everything been inherited', function () {
      var launched = app
      .set('foo', 'foo')
      .def('bar', function () {
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
      app.def('hello', function () {
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

      proxy.def('&/hello', function (get) {
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

      app.def('hello', function () {
        throw 'Hello error'
      })

      app.eval('hello', cb)

      onerror.calledWith('Hello error').should.be.true
      cb.called.should.be.false
    })

    it('Supports async errors', function () {
      var onerror = sinon.spy()
      app.onerror(onerror)

      app.def('hello', function (_, done) {
        done('Hello error')
      })

      app.eval('hello', cb)

      onerror.calledWith('Hello error').should.be.true
      cb.called.should.be.false
    })

    it('Errors are bubbling', function () {
      app.def('hello/world/path', function () {
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
      app.def('hello', function () {
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
      app.def('hello', function () {
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

      app.def('foo', function () {
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

  describe('Hooks', function () {
    var calls

    beforeEach(function () {
      calls = ''
    })

    describe('before hook', function () {
      it('Should be executed before box and it`s dependencies', function () {
        app.def('foo', ['bar'], function (get) {
          calls += 'foo;'
        }).def('bar', function () {
          calls += 'bar;'
        }).before('foo', function () {
          calls += 'before;'
        }).eval('foo')

        calls.should.equal('before;bar;foo;')
      })

      it('Last defined should be executed first', function () {
        app.def('foo', function () {
          calls += 'foo;'
        }).before('foo', function () {
          calls += 'hook1;'
        }).before('foo', function () {
          calls += 'hook2;'
        }).eval('foo')

        calls.should.be.equal('hook2;hook1;foo;')
      })

      it('Should support asynchrony', function () {
        var hookDone

        app.def('foo', function () {
          calls += 'foo;'
        }).before('foo', function (get, done) {
          hookDone = done
        }).eval('foo')

        calls.should.equal('')
        hookDone()
        calls.should.equal('foo;')
      })

      it('Can have dependencies', function () {
        app.def('foo/bar', function () {
          calls += 'foo/bar;'
          return 'bar'
        }).def('foo', function () {
          calls += 'foo;'
        }).before('foo', function (get) {
          calls += 'before-foo;'
          get('&/bar').should.equal('bar')
          this.get('&/bar').should.equal('bar')
        }).eval('foo')

        calls.should.equal('foo/bar;before-foo;foo;')
      })

      it('Should throw errors at box path', function (done) {
        app.before('foo', function () {
          throw 'error'
        }).onerror('foo', function (err) {
          err.should.equal('error')
          done()
        }).eval('foo')
      })
    })

    describe('after hook', function () {
      it('Should be executed after box', function (done) {
        app.def('foo', function () {
          return 'a'
        }).after('foo', function (get, val) {
          val.should.equal('a')
          return 'b'
        }).after('foo', function (get, val) {
          val.should.equal('b')
          return 'c'
        }).eval('foo', function (val) {
          val.should.equal('c')
          done()
        })
      })

      it('Should support asynchrony', function () {
        var afterDone

        app.def('foo', function () {
          calls += 'foo;'
        }).after('foo', function (get, val, done) {
          calls += 'after;'
          afterDone = done
        }).eval('foo', function () {
          calls += 'done;'
        })

        calls.should.equal('foo;after;')
        afterDone(null, 10)
        calls.should.equal('foo;after;done;')
        app.get('foo').should.equal(10)
      })

      it('Can have dependencies', function () {
        app.def('foo/bar', function () {
          calls += 'foo/bar;'
          return 'bar'
        }).def('foo/baz', function () {
          calls += 'foo/baz;'
        }).after('foo/baz', ['./bar'], function (get) {
          this.get('./bar').should.equal('bar')
          calls += 'after:foo/baz;'
        }).eval('foo/baz')

        calls.should.equal('foo/baz;foo/bar;after:foo/baz;')
      })

    })

    it('Can be defined before box', function () {
      app.before('foo', function () {
        calls += 'before;'
      }).after('foo', function () {
        calls += 'after;'
      }).def('foo', function () {
        calls += 'foo;'
      }).eval('foo')

      calls.should.equal('before;foo;after;')
    })


    it('Can be defined before .set()', function () {
      app.before('foo', function () {
        calls += 'before;'
      }).after('foo', function () {
        calls += 'after;'
      })

      app.set('foo', 'bar')

      assert.not.exist(app.get('foo'))

      app.eval('foo')

      calls.should.equal('before;after;')
    })

    it('Should be inherited from prototype app', function () {
      var proto = new App

      proto.before('foo', function () {
        calls += 'proto-before;'
      }).after('foo', function () {
        calls += 'proto-after;'
      })

      proto.def('foo', function () {
        calls += 'foo;'
      })

      var app = proto.run()

      app.before('foo', function () {
        calls += 'self-before;'
      }).after('foo', function () {
        calls += 'self-after;'
      })

      app.eval('foo')

      calls.should.equal('self-before;proto-before;foo;proto-after;self-after;')
    })

    it('Should not touch prototype app', function () {
      var proto = new App

      proto.def('foo', function () {
        calls += 'foo;'
      })

      proto.run().before('foo', function () {
        calls += 'before;'
      }).after('foo', function () {
        calls += 'after;'
      })

      proto.eval('foo')

      calls.should.equal('foo;')
    })
  })
})