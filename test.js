const test = require('tape');
const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;
const AppInit = require('./');

test('adding objects should work', t => {
    t.plan(3);

    const app = AppInit({ root : __dirname + '/test-root' });

    const req = new Request('POST', '/test/test', null, { hello : 'world' });
    const res = new Response();
    
    res.on('end', (o) => {
        o = JSON.parse(o);
        
        t.ok(o);
        t.equal(o.hello, 'world');
        t.ok(o._id);

        t.end();
    });

    app(req, res).catch(e => console.log(e))
});

test('getting objects should work', t => {
    t.plan(3);

    const app = AppInit({ root : __dirname + '/test-root' });

    const req = new Request('GET', '/test/test');
    const res = new Response();
    
    res.on('end', (o) => {
        o = JSON.parse(o);
        
        t.ok(o.results);
        t.ok(o.results.length);
        t.ok(o.paging);
        t.end();
    });

    app(req, res).catch(e => console.log(e))
});

function Request(method, url, query, body) {
    this.method = method;
    this.url = url;
    this.query = query || {};
    this.body = body || {};
    this.headers = {};
}

function Response() {
    EventEmitter.call(this);

    this.json = this.emit.bind(this, 'json');
    this.end = this.emit.bind(this, 'end');
    this.setHeader = this.emit.bind(this, 'setHeader');
}

inherits(Response, EventEmitter);