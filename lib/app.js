var Box = require('./box')
var util = require('./util')
var resolve = util.resolvePath


module.exports = App

function App () {}

App.prototype.use = function (fn, var_args) {
  fn.apply(this, [].slice.call(arguments, 1))
  return this
}

App.prototype.def = function (path, deps, fn) {
  var p = this._resolve(path)
  this['_box_val_' + p] = null // generally for the case of app.set()
  var key = '_box_' + p
  var box = Box.create(this, p, deps, fn)
  var prev = this[key]
  if (prev) box.copyHooksFrom(prev)
  this[key] = box
  return this
}

App.prototype.before = function (path, deps, fn) {
  var p = this._resolve(path)
  this._thisBox(p).before(Box.create(this, p, deps, fn))
  return this
}

App.prototype.after = function (path, deps, fn) {
  var p = this._resolve(path)
  this._thisBox(p).after(Box.create(this, p, deps, fn))
  return this
}

App.prototype._thisBox = function (p) {
  var key = '_box_' + p
  var box = this[key]
  if (!box) return this[key] = Box.create(this, p) // dummy box (for holding hooks)
  if (box.proto === this) return box
  return this[key] = box.copy(this)
}

App.prototype.eval = function (path, cb) {
  var promise = this._eval(this._resolve(path))
  if (promise.isReady) {
    cb && cb(promise.val)
    return
  }
  promise.eval(function (err) {
    if (err) return
    cb && cb(promise.val)
  })
  return this
}

App.prototype._eval = function (p) {
  var key = '_box_val_' + p
  if (this[key]) return this[key]
  var box = this['_box_' + p]
  if (!box) throw new Error('Box ' + p + ' is not defined')
  return this[key] = box.eval(this)
}


App.prototype.run = function (path) {
  var instance = Object.create(this)
  path && instance.eval(this._resolve(path))
  return instance
}


App.prototype.get = function (path) {
  var p = this._resolve(path)
  var box = this['_box_val_' + p]
  if (!box || !box.isReady) return
  return box.val
}

App.prototype.set = function (path, val) {
  var p = this._resolve(path)
  var prev = this['_box_' + p]
  if (prev && prev.hasHooks()) {
    this['_box_val_' + p] = null
    var box = this['_box_' + p] = Box.create(this, p, function () {
      return val
    })
    box.copyHooksFrom(prev)
  } else {
    this['_box_val_' + p] = new Box.EvaluatedPromise(val)
    this['_box_' + p] = null
  }
  return this
}

App.prototype.isReady = function (path) {
  var key = '_box_val_' + this._resolve(path)
  return !!this[key] && this[key].isReady
}

App.prototype.onerror = function (path, fn) {
  if (typeof path == 'function') {
    fn = path
    path = '&'
  }
  this['_onerror_' + this._resolve(path)] = fn
  return this
}

App.prototype.raise = function (path, e) {
  if (arguments.length == 1) {
    e = path
    path = '&'
  }
  var p = this._resolve(path)
  var handler, parent = p, self = this

  do {
    p = parent
    handler = this['_onerror_' + p]
    parent = p.replace(/\/[^\/]*$/g, '') // trim last path segment
    if (parent == p) parent = ''
  } while (!handler)

  var proxy = p ? new Proxy(this, p) : this

  function raise (err) {
    if (err == null) return
    if (p == parent) throw err
    self.raise(parent, err)
  }

  try {
    handler.call(proxy, e, raise)
  } catch (err) {
    raise(err)
  }
}

App.prototype._onerror_ = function (e) {
  throw e
}

App.prototype._resolve = function (path) {
  return resolve('', path)
}


App.prototype.prefix = function (p) {
  return new Proxy(this, p)
}


function Proxy (app, prefix) {
  this.prefix = prefix
  this.app = app
}

;['get', 'set', 'isReady'].forEach(function (meth) {
  Proxy.prototype[meth] = function (path) {
    path = resolve(this.prefix, path)
    return this.app[meth].apply(this.app, arguments)
  }
})

;['def', 'onerror', 'eval'].forEach(function (meth) {
  Proxy.prototype[meth] = function (path) {
    path = resolve(this.prefix, path)
    this.app[meth].apply(this.app, arguments)
    return this
  }
})

Proxy.prototype.use = App.prototype.use