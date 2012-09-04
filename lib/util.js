exports.resolvePath = function resolvePath (from, to) {
    if (to[0] != '.' && to[0] != '&') return to

    var path = from.split('/')
    var segs = to.split('/')
    if (to[0] != '&') path.pop()
    segs.forEach(function (seg, index) {
        if (seg == '.' || seg == '&') return
        if (seg == '..') {
            path.pop()
            return
        }
        path.push(seg)
    })
    return trimSlash(path.join('/'))
}

function trimSlash (s) {
    return s[0] == '/' ? s.slice(1) : s
}


exports.parseDeps = function parseDependencies (fn) {
    var deps = []
    var src = fn.toString()

    src = src.replace(/(\/\*([\s\S]*?)\*\/|\/\/(.*)$)/mg, '') // remove comments

    var m = /^function(?:\s+\w+)?\s*\((\w+)/.exec(src) // determine the name of the get function
    if (!m) return deps
    var get = m[1]

    var regex = new RegExp('(\\.\\s*)?' + get + '\\(\\s*["\']([^\'"\\s]+)["\']\\s*\\)', 'g')

    src.replace(regex, function (_, isProp, dep) {
        !isProp && deps.push(dep)
    })

    return deps
}
