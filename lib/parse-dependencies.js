
module.exports = function parseDependencies (fn) {
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