#!/usr/bin/env node
const UseyHttp = require('usey-http');
const SymDb = require('symdb');
const path = require('path');
const argv = require('yargs').argv;

const symdbs = {};
const root = argv.root || process.env.SYMDB_REST_ROOT || '/opt/symdb';
const port = argv.port || process.env.SYMDB_REST_PORT || 8787;

const app = UseyHttp();

app.use(UseyHttp.queryParser());
app.use(UseyHttp.bodyParser.json());

// register route to get stuff
app.get('/:database/:collection', function (req, res) {
    const database = req.params.database;
    const collection = req.params.collection;

    const db = resolveSymdb(database);
    const model = resolveModel(collection, db);

    const page = req.query._page || 1;
    const limit = req.query._limit || 10;

    delete req.query._page;
    delete req.query._limit;

    model.page(page, limit).get(req.query).then(data => {
        //rename paging.size to paging.limit
        data._page.limit = data._page.size;
        delete data._page.size;

        res.json({
            results : data
            , paging : data._page
        });
    }).catch(e => {
        res.json({
            error : e
        });
    });
});

// register route to create stuff
app.post('/:database/:collection', function (req, res) {
    const database = req.params.database;
    const collection = req.params.collection;

    const db = resolveSymdb(database);
    const model = resolveModel(collection, db);

    model.add(req.body).then(data => {
        res.json(data);
    }).catch(e => {
        res.json({
            error : e
        });
    });
});

// register route to update stuff
app.patch('/:database/:collection', function (req, res) {
    const database = req.params.database;
    const collection = req.params.collection;

    const db = resolveSymdb(database);
    const model = resolveModel(collection, db);

    const data = model.update(req.body).then(data => {
        res.json(data);
    }).catch(e => {
        res.json({
            error : e
        });
    });
});

app.use(function (req, res) {
    res.status(404);
    res.json({
        error : 'not found'
    });
});

app.listen(port);

function resolveSymdb(name) {
    if (symdbs[name]) {
        return symdbs[name];
    }

    const db = new SymDb({
        root : path.join(root, name)
    });

    symdbs[name] = db;

    return db;
}

function resolveModel(name, db) {
    if (db.models[name]) {
        return db.models[name];
    }

    const model = db.Model(name, {
        id : String
    });

    model.on('update:before', SymDb.patcher({ id : 'id' }));
    model.on('delete:before', SymDb.patcher({ id : 'id' }));

    return model;
}