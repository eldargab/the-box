var resolve = require('./path-resolve')

module.exports = Box
module.exports.Evaluated = EvaluatedBox

function Box (path, deps, fn) {
    this.isReady = false
    this.evaluating = false
    this.fn = fn
    this.path = path
    this.isSync = fn.length < 2
    this.deps = deps.map(function (dep) {
        return resolve(path, dep)
    })
}

Box.prototype.eval = function (app, cb) {
    cb && this.onready(cb)
    if (this.evaluating) return
    this.evaluating = true
    this.evalDependencies(app, 0, this.execute)
}

Box.prototype.evalDependencies = function (app, index, cb) {
    var self = this, sync = true
    while (sync) {
        var dep = this.deps[index++]
        if (!dep) return cb.call(this, app)
        var box = app._box(dep)
        if (box.isReady) continue
        var done = false
        box.eval(app, function () {
            done = true
            if (sync) return
            self.evalDependencies(app, index, cb)
        })
        sync = done
    }
}

Box.prototype.execute = function (app) {
    var proxy = app.prefix(this.path)
    var self = this

    function get (p) {
        return proxy.get(p)
    }

    try {
        this.isSync
            ? this.done(this.fn.call(proxy, get))
            : this.fn.call(proxy, get, function (error, val) {
                if (error) return app._raise(self.path, error)
                self.done(val)
            })
    } catch (e) {
        app._raise(this.path, e)
    }
}

Box.prototype.done = function (val) {
    this.isReady = true
    this.val = val
    if (!this.callbacks) return
    for (var i = 0; i < this.callbacks.length; i++) {
        this.callbacks[i](val)
    }
    this.callbacks = null
}

Box.prototype.onready = function (cb) {
    this.callbacks = this.callbacks || []
    this.callbacks.push(cb)
}


function EvaluatedBox (val) {
    this.val = val
}

EvaluatedBox.prototype.isReady = true