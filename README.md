# the-box

Can you see what's wrong with this code?

``` javascript
'async'
var db = require('db')
var user = require('user')
var res = require('response')

db.collection('users').find({id: {$in: user.friends}}, function (err, docs) {
  if (err) return done(err)
  res.json(docs)
})
```

Definitely it's a valid javascript and it just returns a list of friends. The
strange point is

``` javascript
var res = require('response')
```

We know that node's require system works only for static dependencies. How can
we require `response`? Right. There is no way to do that, however this is
exactly how we want to write our programs and this project seems to be a
successful attempt to make the above snippet fully functional in the real world
app.

## How it works

Oh, don't afraid, it doesn't touch the require system. It implements it's own
[dependency based computational model
:)](http://martinfowler.com/articles/rake.html#DependencyBasedProgramming)
similar to these ones used by build systems (like rake, make) and by node's
`require`. This project was inspired by [The-
Kiln](https://github.com/straszheimjeffrey/The-Kiln) and can be thought as a re
implementation of the same concepts but for javascript.

Lets dive into a code.

``` javascript
var App = require('the-box')
var app = new App

app.def('db', function () {
  return require('monk')('localhost/mydb,192.168.1.1')
})
```

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
box doesn't exist or not yet evaluated. Boxes themselves also can get values:

``` javascript
app.def('db', function (get) {
  return require('monk')(get('db-connection-string'))
})
```

and framework ensures that before evaluation of the box all it's dependencies
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

Now we are almost ready to make our first snippet functional. The last point is
how we are going to reuse our db instance across multiple requests? It is
simple. We can eval it on the app level and then

``` javascript
app.eval('db', function () {
  Object.create(app)
    .set('request', req)
    .set('response', res)
    .eval('list-friends')
})
```

After we created a new app all evaluated boxes remained evaluated and
definitions were not lost. That's how it works. The difference between static,
boot-time, x-time dependencies is gone. We can define as many levels as we want.

The full solution for the "list friends" problem in a form of middleware would
be

``` javascript
var App = require('the-box')
var app = new App

module.exports = function (req, res, next) {
  app.eval('init', function () {
    app.run()
      .set('request', req)
      .set('response', res)
      .onerror(next)
      .eval('list-friends')
  })
}

app.def('init', ['db'])

app.def('list-friends', function (get, done) {
  var db = get('db')
  var user = get('user')
  var res = get('response')

  db.collection('users').find({id: {$in: user.friends}}, function (err, docs) {
    if (err) return done(err)
    res.json(docs)
  })
})

app.def('user', function (get, done) {
  var req = get('request')
  get('db').collection('users').findOne({
    id: req.param('user')
  }, done)
})

app.def('db', function () {
  return require('monk')('localhost/mydb,192.168.1.1')
})
```