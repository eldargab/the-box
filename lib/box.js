var util = require('./util')

module.exports = Box

Box.create = function (proto, path, deps, fn) {
  if (typeof deps == 'function') {
    fn = deps
    deps = util.parseDeps(fn)
  }
  deps = deps && deps.map(function (p) {
    return util.resolvePath(path, p)
  })
  deps = deps || []
  fn = fn || util.NOOP
  return new Box(proto, path, deps, fn)
}

Box.EvaluatedPromise = EvaluatedPromise

function Box (proto, path, deps, fn) {
  this.proto = proto
  this.path = path
  this.fn = fn
  this.deps = deps
}

Box.prototype.copyHooksFrom = function (box) {
  this.befores = box.befores && box.befores.slice()
  this.afters = box.afters && box.afters.slice()
  return this
}

Box.prototype.copy = function (app) {
  var box = new Box(app, this.path, this.deps, this.fn)
  box.copyHooksFrom(this)
  return box
}

Box.prototype.before = function (box) {
  this.befores = this.befores || []
  this.befores.unshift(box)
  return this
}

Box.prototype.after = function (box) {
  this.afters = this.afters || []
  this.afters.push(box)
  return this
}

Box.prototype.hasHooks = function () {
  return !!this.befores || !!this.afters
}

Box.prototype.eval = function (app) {
  return new Promise(app, this)
}


function Promise (app, box) {
  this.app = app
  this.box = box
}

Promise.prototype.eval = function (cb) {
  cb && this.onready(cb)
  if (this.evaluating) return;
  this.evaluating = true

  var queue = []

  this.befores(queue)
  queueBoxes(queue, this.app, this.box.deps)
  queue.push(new Execute(this.app, this.box, this))
  this.afters(queue)

  this.flush(queue, 0)
}

Promise.prototype.befores = function (q) {
  var befores = this.box.befores
  if (!befores) return;
  for (var i = 0; i < befores.length; i++) {
    q.push(new Promise(this.app, befores[i]))
  }
}

function queueBoxes (q, app, boxes) {
  for (var i = 0; i < boxes.length; i++) {
    q.push(app._eval(boxes[i]))
  }
}

Promise.prototype.afters = function (q) {
  var afters = this.box.afters
  if (!afters) return;
  for (var i = 0; i < afters.length; i++) {
    queueBoxes(q, this.app, afters[i].deps)
    q.push(new ExecuteAfter(this.app, afters[i], this))
  }
}

Promise.prototype.flush = function (queue, step) {
  var sync = true, self = this
  while (sync) {
    if (queue.length == step) return this.done()
    var next = queue[step++]
    if (next.isReady) continue
    var done = false
    next.eval(function (err) {
      if (err) return self.done(err)
      done = true
      if (sync) return
      self.flush(queue, step)
    })
    sync = done
  }
}

Promise.prototype.done = function (err) {
  this.isReady = !err
  if (this.callbacks) {
    for (var i = 0; i < this.callbacks.length; i++) {
      this.callbacks[i](err, this.val)
    }
  }
  this.evaluating = false
  this.callbacks = null
}

Promise.prototype.onready = function (cb) {
  this.callbacks = this.callbacks || []
  this.callbacks.push(cb)
}


function Execute (app, box, promise) {
  this.app = app
  this.box = box
  this.promise = promise
}

Execute.prototype.eval = function (cb) {
  var self = this

  var proxy = this.app.at(this.box.path)

  function get (p) {
    return proxy.get(p)
  }

  var fn = this.box.fn

  var isSync = fn.length < 2

  try {
    if (isSync) {
      this.promise.val = fn.call(proxy, get)
      cb()
    } else {
      fn.call(proxy, get, function (error, val) {
        if (error) {
          cb(error)
          self.app.raise(self.box.path, error)
          return
        }
        self.promise.val = val
        cb()
      })
    }
  } catch (e) {
    cb(e)
    this.app.raise(this.box.path, e)
  }
}


function ExecuteAfter (app, box, promise) {
  this.app = app
  this.box = box
  this.promise = promise
}

ExecuteAfter.prototype.eval = function (cb) {
  var self = this

  var proxy = this.app.at(this.box.path)

  function get (p) {
    return proxy.get(p)
  }

  var fn = this.box.fn

  var isSync = fn.length < 3

  try {
    if (isSync) {
      var val = fn.call(proxy, get, this.promise.val)
      if (val !== undefined) this.promise.val = val
      cb()
    } else {
      fn.call(proxy, get, this.promise.val, function (error, val) {
        if (error) {
          cb(error)
          self.app.raise(self.box.path, error)
          return
        }
        if (val !== undefined) self.promise.val = val
        cb()
      })
    }
  } catch (e) {
    cb(e)
    this.app.raise(this.box.path, e)
  }
}


function EvaluatedPromise (val) {
  this.val = val
}

EvaluatedPromise.prototype.isReady = true