var resolve = require('./path-resolve')
var parseDeps = require('./parse-dependencies')
var Box = require('./box')

module.exports = App

function App () {}

App.prototype.use = function (fn, var_args) {
    fn.apply(this, [].slice.call(arguments, 1))
    return this
}

App.prototype.def = function (path, deps, fn) {
    if (typeof deps == 'function') {
        fn = deps
        deps = fn.deps || parseDeps(fn)
    }
    fn = fn || NOOP
    deps = deps || []
    var p = this._resolve(path)
    this['_box_proto_' + p] = new Box(p, deps, fn)
    return this
}

App.prototype.run = function (path) {
    var instance = Object.create(this)
    path && instance.eval(this._resolve(path))
    return instance
}

App.prototype.eval = function (path, cb) {
    var box = this._box(this._resolve(path))
    cb = cb || NOOP
    if (box.isReady) {
        cb(box.val)
        return
    }
    box.eval(this, cb)
    return this
}

App.prototype._box = function (p) {
    var box = this['_box_' + p]
    if (box) return box
    var proto = this['_box_proto_' + p]
    if (!proto) throw new Error('Box ' + p + ' is not defined')
    return this['_box_' + p] = Object.create(proto)
}

App.prototype.get = function (path) {
    var p = this._resolve(path)
    var box = this['_box_' + p] || this['_box_proto_' + p]
    if (!box) return
    if (!box.isReady) throw new Error('Box ' + p + 'is not yet evaluated')
    return box.val
}

App.prototype.set = function (path, val) {
    this['_box_' + this._resolve(path)] = new Box.Evaluated(val)
    return this
}

App.prototype.isReady = function (path) {
    var key = '_box_' + this._resolve(path)
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

App.prototype._raise = function (p, e) {
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
        self._raise(parent, err)
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

function NOOP () {}