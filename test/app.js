var App = require('../lib/app')

describe('App', function () {
  var app

  function log (s) {
    log.string = log.string
      ? log.string + ' ' + s
      : s
  }

  Object.defineProperty(log, 'should', {
    get: function () {
      return this.string.should
    }
  })

  beforeEach(function () {
    app = new App
    log.string = ''
  })

  describe('.eval(box, [cb])', function () {
    it('Throws if box is not defined', function () {
      ;(function () {
        app.eval('hi')
      }).should.throw()
    })

    it('Calls box function to get actual value', function (done) {
      app.def('foo', function () {
        return 'bar'
      }).eval('foo', function (val) {
        val.should.equal('bar')
        done()
      })
    })

    it('If box function has arity greater then one, it is async', function (done) {
      var end

      app.def('foo', function (get, _end) {
        end = _end
      }).eval('foo', function (val) {
        val.should.equal('done')
        done()
      })

      end(null, 'done')
    })

    it('Box function can get values of other boxes via getter passed in the first param', function (done) {
      app.def('bar', function () {
        return 'bar'
      }).def('baz', function () {
        return 'baz'
      }).def('foo', function (get) {
        get('bar').should.equal('bar')
        get('baz').should.equal('baz')
        done()
      }).eval('foo')
    })

    it('The getter passed to the box is relative to it`s path', function (done) {
      function def (val) {
        app.def(val, function () {
          return val
        })
      }

      def('a/b'); def('a/b/d'); def('a/b/c/d'); def('a/x/y')

      app.def('a/b/c', function (get) {
        get('a/b').should.equal('a/b')
        get('./d').should.equal('a/b/c/d')
        get('../../x/./y').should.equal('a/x/y')
        done()
      }).eval('a/b/c')
    })

    it('Evaluates all box dependencies before evaluating box itself', function () {
      var a, xb, xc

      app.def('a', ['x/b', 'x/c'], function (_, done) {
        log('a')
        a = done
      }).def('x/b', ['../c'], function (_, done) {
        log('xb')
        xb = done
      }).def('x/c', function (_, done) {
        log('xc')
        xc = done
      }).eval('a', function () {
        log('done')
      })

      log.should.equal('xc')
      xc()
      log.should.equal('xc xb')
      xb()
      log.should.equal('xc xb a')
      a()
      log.should.equal('xc xb a done')
    })
  })

  describe('.set(key, val)', function () {
    it('Defines evaluated box `key` holding `val`', function (done) {
      app.set('greeting', 'hello').eval('greeting', function (val) {
        val.should.equal('hello')
        done()
      })
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
      app.def('baz', function (get, done) {}).eval('baz')
      app.def('bar', function () {})

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

  describe('.at(root)', function () {
    it('Creates proxy which resolves all paths relative to `root`', function () {
      var proxy = app.at('root')

      app.set('root/foo', 'foo')
      proxy.get('./foo').should.equal('foo')

      proxy.set('./baz', 'baz')
      app.get('root/baz').should.equal('baz')

      app.set('hi', 'hi')
      proxy.get('hi').should.equal('hi')
      proxy.isReady('../hi').should.be.true

      proxy.def('./hello', function (get) {
        return get('./world') + ' ' + get('../people')
      })
      app.set('root/hello/world', 'world')
      proxy.set('./people', 'people')
      proxy.eval('./hello')
      app.get('root/hello').should.equal('world people')
    })
   })

  describe('Error handling', function () {
    it('Exeptions from boxes are catched', function () {
      app.def('hello', function () {
        throw 'Hello error'
      })

      app.onerror(function (err) {
        err.should.equal('Hello error')
        log('onerror')
      })

      app.eval('hello', function () {
        log('done')
      })

      log.should.equal('onerror')
    })

    it('Supports async errors', function () {
      app.def('hello', function (_, done) {
        done('Hello error')
      }).onerror(function (err) {
        err.should.equal('Hello error')
        log('onerror')
      }).eval('hello', function () {
        log('done')
      })

      log.should.equal('onerror')
    })

    it('Errors are bubbling', function () {
      app.def('hello/world/path', function () {
        throw 'error'
      })


      app.onerror('hello/world/path', function (err) {
        err.should.equal('error')
        log('1')
        throw '1'
      })

      app.onerror('hello/world', function (err, raise) {
        err.should.equal('1')
        log('2')
        raise('2')
      })

      app.onerror('hello', function (err, raise) {
        err.should.equal('2')
        log('3')
      })

      app.onerror(function (err) {
        should.fail("Shouldn't be called since we are not rethrowing in the child handler")
      })

      app.eval('hello/world/path')

      log.should.equal('1 2 3')
    })

    it('`raise` function passed to the handler can be used as a node style callback', function () {
      app.def('hello', function () {
        throw 'Hello error'
      })

      app.onerror('hello', function (err, raise) {
        raise(null, err)
      })

      app.onerror(function () {
        log('error')
      })

      app.eval('hello')

      log.should.be.empty
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
        this.get('./bar').should.equal('bar')
        log('onerror')
        throw err
      })

      app.onerror(function () {
        this.should.equal(app)
        log.should.equal('onerror')
        done()
      })

      app.eval('foo')
    })
  })

  describe('Hooks', function () {
    describe('before hook', function () {
      it('Should be executed before box and it`s dependencies', function () {
        app
          .def('foo', ['bar'], function () {
            log('foo')
          })
          .def('bar', function () {
            log('bar')
          })
          .before('foo', function () {
            log('before')
          })
          .eval('foo')

        log.should.equal('before bar foo')
      })

      it('Last defined should be executed first', function () {
        app
          .def('foo', function () {
            log('foo')
          })
          .before('foo', function () {
            log('hook1')
          })
          .before('foo', function () {
            log('hook2')
          })
          .eval('foo')

        log.should.equal('hook2 hook1 foo')
      })

      it('Should support asynchrony', function () {
        var hookDone

        app
          .def('foo', function () {
            log('foo')
          })
          .before('foo', function (get, done) {
            hookDone = done
          })
          .eval('foo')

        log.should.be.empty
        hookDone()
        log.should.equal('foo')
      })

      it('Can have dependencies', function () {
        app.def('foo/bar', function () {
          log('foo/bar')
          return 'bar'
        }).def('foo', function () {
          log('foo')
        }).before('foo', function (get) {
          get('./bar').should.equal('bar')
          this.get('./bar').should.equal('bar')
          log('before-foo')
        }).eval('foo')

        log.should.equal('foo/bar before-foo foo')
      })

      describe('Should throw errors at box path', function () {
        it('sync', function (done) {
          app.before('foo', function () {
            throw 'error'
          }).onerror('foo', function (err) {
            err.should.equal('error')
            done()
          }).eval('foo')
        })

        it('async', function (done) {
          app.before('foo', function (get, end) {
            end('error')
          }).onerror('foo', function (err) {
            err.should.equal('error')
            done()
          }).eval('foo')
        })
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

        app
          .def('foo', function () {
            log('foo')
          })
          .after('foo', function (get, val, done) {
            log('after')
            afterDone = done
          })
          .eval('foo', function () {
            log('done')
          })

        log.should.equal('foo after')
        afterDone(null, 10)
        log.should.equal('foo after done')
        app.get('foo').should.equal(10)
      })

      it('Can have dependencies', function () {
        app.def('foo/bar', function () {
          log('foo/bar')
          return 'bar'
        }).def('foo/baz', function () {
          log('foo/baz')
        }).after('foo/baz', ['../bar'], function () {
          this.get('../bar').should.equal('bar')
          log('after:foo/baz')
        }).eval('foo/baz')

        log.should.equal('foo/baz foo/bar after:foo/baz')
      })

      describe('Should throw errors at box path', function () {
        it('sync', function (done) {
          app.after('foo', function () {
            throw 'error'
          }).onerror('foo', function (err) {
            err.should.equal('error')
            done()
          }).eval('foo')
        })

        it('async', function (done) {
          app.after('foo', function (get, val, end) {
            end('error')
          }).onerror('foo', function (err) {
            err.should.equal('error')
            done()
          }).eval('foo')
        })
      })

    })

    it('Can be defined before box', function () {
      app
        .before('foo', function () {
          log('before')
        })
        .after('foo', function () {
          log('after')
        })
        .def('foo', function () {
          log('foo')
        })
        .eval('foo')

      log.should.equal('before foo after')
    })


    it('Can be defined before .set()', function () {
      app
        .before('foo', function () {
          log('before')
        })
        .after('foo', function () {
          log('after')
        })
        .set('foo', 'bar')

      assert.not.exist(app.get('foo'))

      app.eval('foo')

      log.should.equal('before after')
    })

    it('Should be inherited from prototype app', function () {
      var proto = new App

      proto
        .before('foo', function () {
          log('proto-before')
        })
        .after('foo', function () {
          log('proto-after')
        })
        .def('foo', function () {
          log('foo')
        })

      proto.run()
        .before('foo', function () {
          log('self-before')
        })
        .after('foo', function () {
          log('self-after')
        })
        .eval('foo')

      log.should.equal('self-before proto-before foo proto-after self-after')
    })

    it('Should not touch prototype app', function () {
      var proto = new App

      proto.def('foo', function () {
        log('foo')
      })

      proto.run()
        .before('foo', function () {
          log('before')
        })
        .after('foo', function () {
          log('after')
        })

      proto.eval('foo')

      log.should.equal('foo')
    })
  })
})