
module.exports = function resolvePath (from, to) {
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
