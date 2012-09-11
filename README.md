# the-box

Can you see what's wrong with this code?

``` javascript
var db = require('db')
var user = require('user')
var res = require('response')

db.collection('users').find({id: {$in: user.friends}}, function (err, docs) {
  if (err) return done(err)
  res.json(docs)
})
```

Actually it is a very neat piece of code except that there is no way to require
`response` with node.js require system.

This project is about making the above snippet fully functional and it seems it
succeeded. It completely removes artificial boundary between static, boot-time,
request-time, whatever-time dependencies allowing you super easily define as
many layers as you want while completely freeing modules from dependency issues.
This project was inspired by [The-Kiln](https://github.com/straszheimjeffrey/The-Kiln)
and is nothing but an implementation of
[dependency based computational model :)](http://martinfowler.com/articles/rake.html#DependencyBasedProgramming)
similar to what is used by build systems (like rake, make) and by node.js
`require`.

## How it looks like

``` javascript
var express = require('express')
var App = require('the-box')
var app = new App

app.set('connection-string', 'localhost/mydb,192.168.1.1')

app.def('db', function (get) {
  return require('monk')(get('connection-string'))
})

app.def('user', function (get, done) {
  var req = get('request')
  get('db').collection('users').findOne({
    id: req.param('user')
  }, done)
})

app.def('list-friends', function (get, done) {
  var db = get('db')
  var user = get('user')
  var res = get('response')

  db.collection('users').find({id: {$in: user.friends}}, function (err, docs) {
    if (err) return done(err)
    res.json(docs)
  })
})

app.def('init', ['db'])

express().use(function (req, res, next) {
  app.eval('init', function () {
    Object.create(app)
      .set('request', req)
      .set('response', res)
      .onerror(next)
      .eval('list-friends')
  })
}).listen(3000)
```

## Explanation

The `app.def()` method defines what is internally called a box, aka task (in
rake), aka module (in node).

Once the box was defined we can evaluate it.

``` javascript
app.eval('db', function (db) {
  // use db instance here
})
```

A value of evaluated box is cached, so subsequent evals do not result in
repeated calls to the definition function.

Another way to define box is to use `app.set()` method

``` javascript
app.set('db-connection-string', 'localhost/mydb,192.168.1.1')
```

We can get a value of evaluated box with `app.get()`. It returns `undefined` if
box doesn't exist or not yet evaluated.

Boxes themselves also can get values:

``` javascript
app.def('db', function (get) {
  return require('monk')(get('db-connection-string'))
})
```
and framework ensures that before evaluation of the box all its dependencies
were evaluated. There are two ways to specify dependencies

``` javascript
// list them explicitly
app.def('foo', ['bar', 'baz'], function (get) {
  return get('bar') + get('baz')
})

// or allow to infer them from the function source
app.def('foo', function (get) {
  return get('bar') + get('baz') // it's evident that we depend on bar and baz
})
```

Of course, boxes can be asynchronous

``` javascript
app.def('user', function (get, done) {
  var req = get('request')
  get('db').collection('users').findOne({
    id: req.param('user')
  }, done)
})
```

Perhaps the most strongest point of `the-box` is how it manages dependency
levels. You can just create a new app instance with `Object.create(app)` and
this instance will inherit all box definitions and every evaluated box will
remain evaluated while subsequent manipulations (evals, defs, etc) with new
instance will not change the parent app.

``` javascript
app.eval('init', function () {
  Object.create(app) // we have app.run() for this, but Object.create is what going on
    .set('request', req)
    .set('response', res)
    .eval('something')
})
```

## Misc details

All boxes are evaluated sequentially.

### paths

There is a concept of path

``` javascript
app.def('a/b/c', function (get) {
  get('a/b').should.equal('a/b')
  get('./d').should.equal('a/b/c/d')
  get('../x').should.equal('a/b/x')
})
```

``` javascript
app.at('a/b')
  .def('./c', fn)
  .set('../d', val)
// is the same as
app
  .def('a/b/c', fn)
  .set('a/d', val)
```
`this` of the box is set to `app.at('box/path')`

``` javascript
app.def('a/b', function () {
  if (something) this.eval('./c') // eval a/b/c if something
})
```

### Error handling

Errors from boxes (both sync and async) are catched and can be handled.

``` javascript
app.def('foo/bar/baz', function () {
  throw new Error('foo error')
})

app.onerror('foo/bar/baz', function (err) {
  err.message.should.equal('foo error')
})
```

Errors are bubbling. So if the handler for `foo/bar/baz` wouldn't be defined the
handler for `foo/bar` would be checked and so on up to the root level handler
(`app.onerror(fn)`) which by default just throws a given error. It is possible
to rethrow catched errors

``` javascript
app.def('foo/bar/baz', function () {
  throw 'error'
})

app.onerror('foo/bar/baz', function (err) {
  err.should.equal('error')
  throw 'baz'
})

app.onerror('foo/bar', function (err, raise) {
  err.should.equal('baz')
  raise('bar')
  // for convenience raise function can be used as a node style callback
  // raise(null, 'bar') will not throw
})

app.onerror('foo', function (err, raise) {
  err.should.equal('bar')
})

app.onerror(function () {
  should.fail("shouldn't be called since we are not rethrowing in foo handler")
})

app.eval('foo/bar/baz')
```

### Hooks

It is possible to define `before` and `after` hooks for any box. `Before` hooks
are ordinal boxes which are executed before "main" box and it's dependencies.
`After` hooks are also boxes (they can have dependencies, etc) but their signature
is slightly different.

``` javascript
app.def('foo', function () {
  return 'foo'
})

app.after('foo', function (get, val) {
  val.should.equal('foo')
  // we can change the result value of the box by returning
  // something different from undefined
  return 'bar'
})

app.eval('foo', function (val) {
  val.should.equal('bar')
})
```

An async version of after hook has `(get, val, done)` signature.

It is not important when to define hooks. They can be defined before or after
corresponding boxes.

``` javascript
// Example: Automatically parse the request body
var bodyParser = express.bodyParser()

app.after('request', function (get, req, next) {
  bodyParser(req, req.res, next)
})

function server (req, res) {
  app.run()
    .set('request', req)
    .def('task', function (get) {
      get('request').should.have.property('body')
    })
    .eval('task')
}
```

## Installation

Via npm

```
npm install the-box
```

To run tests first install dev dependencies and then run npm test command.

```
npm install -d
npm test
```

## Misc

[express-in-the-box](https://github.com/eldargab/express-in-the-box) project is
an integration of awesome express request-response prototypes and router with
the-box container.

## License

(The MIT License)

Copyright (c) 2012 Eldar Gabdullin <eldargab@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.