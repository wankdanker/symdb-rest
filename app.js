const UseyHttp = require('usey-http');
const SymDb = require('symdb');
const path = require('path');
const getValue = require('get-value');
const generateSchema = require('generate-schema');
const generateOpenapi = require('@openapi-contrib/json-schema-to-openapi-schema');

module.exports = init;

/**
 * Initialize a new Symdb backed REST interface.
 *
 * @param {Object} opts
 * @param {string} opts.root the path to the root directory of the symdb databases and collections
 * @returns
 */
function init (opts) {
    opts = opts || {};

    const root = opts.root;

    // our app
    const app = UseyHttp();

    //attach some local functions to the app for external use
    app.resolveSymdb = resolveSymdb;
    app.resolveModel = resolveModel;

    // this contains instances of symdbs
    // also available on the instance on the app that we are returning from init
    const symdbs = app.symdbs = {};

    // register route to get stuff
    app.get('/:database/:collection', get);
    app.get('/:database/:collection/schema', get);
    app.get('/:database/:collection/openapi', get);
    app.get('/:database/:collection/:query', get);
    app.get('/:database/:collection/:query/field/:fields', get);

    // register route to create stuff
    app.post('/:database/:collection', post);

    // register route to update stuff
    app.patch('/:database/:collection', patch);

    // register route to delete stuff
    app.delete('/:database/:collection', del);

    // register default error handler
    app.use('error', error);

    // register last resort 404 handler
    app.use(_404);

    return app;

    /**
     * A simple handler for get requests (read)
     *
     * @param {*} req
     * @param {*} res
     * @param {*} next
     */
    function get (req, res, next) {
        const database = req.params.database;
        const collection = req.params.collection;

        const db = resolveSymdb(database);
        const model = resolveModel(collection, db);

        const schema = ~req.url.indexOf('schema');
        const openapi = ~req.url.indexOf('openapi');
        const page = req.query._page || 1;
        const limit = req.query._limit || 10;
        const fields = fieldify(req.params.fields || req.query._fields || null);
        const sort = sortify(req.query._sort || null);
        const query = queryify(req.params.query || req.query);

        clean(req.query);

        model.page(page, limit).sort(sort).get(query).then(data => {
            //rename paging.size to paging.limit
            data._page.limit = data._page.size;
            delete data._page.size;

            if (fields) {
                for (const record of data) {
                    for (const field of fields) {
                        let val = getValue(record, field.key);

                        if (field.decode === 'base64') {
                            val = Buffer.from(val, 'base64').toString();
                        }
                        
                        if (val != null) {
                            res.write(val);
                        }
                    }
                }

                return res.end();
            }

            if (schema || openapi) {
                let jschema = generateSchema.json(collection, data);

                if (!openapi) {
                    return res.json(jschema);
                }

                return generateOpenapi(jschema).then(oschema => res.json(oschema)).catch(next);
            }

            res.json({
                results : data
                , paging : data._page
            });
        }).catch(next);
    }

    /**
     * A simple handler for post requests (create)
     *
     * @param {*} req
     * @param {*} res
     * @param {*} next
     */
    function post (req, res, next) {
        const database = req.params.database;
        const collection = req.params.collection;

        const db = resolveSymdb(database);
        const model = resolveModel(collection, db);

        model.add(req.body).then(data => {
            res.json(data);
        }).catch(next);
    }

    /**
     * A simple handler for patch requests (update)
     *
     * @param {*} req
     * @param {*} res
     * @param {*} next
     */
    function patch (req, res, next) {
        const database = req.params.database;
        const collection = req.params.collection;

        const db = resolveSymdb(database);
        const model = resolveModel(collection, db);

        model.update(req.body).then(data => {
            res.json(data);
        }).catch(next);
    }

    /**
     * A simple handler for delete requests (delete)
     *
     * @param {*} req
     * @param {*} res
     * @param {*} next
     */
    function del (req, res, next) {
        const database = req.params.database;
        const collection = req.params.collection;

        const db = resolveSymdb(database);
        const model = resolveModel(collection, db);

        model.del(req.body).then(data => {
            res.json(data);
        }).catch(next);
    }

    /**
     * A generic error handler
     *
     * @param {*} e
     * @param {*} req
     * @param {*} res
     */
    function error (e, req, res) {
        //if e.code is a number, then use it for status, otherwise use 500
        let code = Number.isFinite(e.code) && e.code || 500;

        res.status(code);

        res.json({
            error : {
                message : e.message || 'An unspecified error occurred.'
                , code : e.code
                // , stack : e.stack
            }
        });
    }

    /**
     * A generic 404 handler
     *
     * @param {*} req
     * @param {*} res
     */
    function _404(req, res) {
        res.status(404);
        res.json({
            error : 'not found'
        });
    }

    /**
     * Resolve a symdb instance by name. Create it if it does not exist
     *
     * @param {*} name
     * @returns
     */
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

    /**
     * Resolve a model by name in an instance of a symdb. Create it if it does not exist
     *
     * @param {*} name
     * @param {*} db
     * @returns
     */
    function resolveModel(name, db) {
        if (db.models[name]) {
            return db.models[name];
        }

        const model = db.Model(name, {
            id : String
        });

        model.on('update:before', SymDb.patcher({ id : 'id', _id : '_id' }));
        model.on('delete:before', SymDb.patcher({ id : 'id', _id : '_id' }));

        return model;
    }

    /**
     * Remove symdb-rest specific queryString keys from req.query
     *
     * @param {*} obj
     */
    function clean(obj) {
        delete obj._page;
        delete obj._limit;
        delete obj._field;
        delete obj._sort;
        delete obj._decode;
    }

    /**
     * Convert a string of sortable fields to an hash
     *
     * @param {*} str   example: field1:asc,field2:desc
     */
    function sortify(str) {
        if (!str) {
            return null;
        }

        const sort = {};

        const fields = str.split(/,/g);

        fields.forEach(field => {
            const tokens = field.split(':');
            sort[tokens[0]] = tokens[1] || 'asc';
        });

        return sort;
    }

    /**
     * Convert an object or string to an object of symdb filters
     *
     * @param {(Object|string)} query
     * @returns
     */
    function queryify(query) {
        //if the query is an object, assume it's a hash
        //loop over each attribute and try to create a SymDb filter
        if (query && typeof query === 'object') {
            Object.keys(query).forEach(key => {
                query[key] = toSymdbFilter(query[key]);
            });
            
            return query;
        }

        let result = {};

        //assume it's a query in the form of
        //field1:value;field2:value
        //field1:startsWith(value);field2:contains(value)
        if (typeof query === 'string') {
            const fields = query.split(/;/g);

            fields.forEach(field => {
                const tokens = field.split(':');
                const key = tokens.shift();
                const value = tokens.join(':');

                if (!key) {
                    return;
                }

                result[key] = toSymdbFilter(value);
            });
        }

        return result;
    }

    /**
     * convert a string into an array of field objects
     * 
     * "some.deep.key:base64:some.deep.contentType;key2;key3" =>
     * [{
     *   key : 'some.deep.key'
     *   , decode : 'base64'
     *   , contentType : 'some.deep.contentType'
     * }
     * , {
     *   key : 'key2'
     * }
     * , {
     *   key : 'key3'
     * }]
     * 
     * @param {*} str
     */
    function fieldify(str) {
        if (!str) {
            return null;
        }

        const result = [];

        const fields = str.split(/;/g);

        fields.forEach(field => {
            const tokens = field.split(/:/);

            result.push({
                key : tokens[0]
                , decode : tokens[1]
                , contentType : tokens[2]
            });
        });

        return result;
    }

    /**
     * Convert a string to a Symdb filter
     * 
     * toSymdbFilter('contains(soy)') => Symdb.contains('soy')
     *
     * @param {string} str
     */
    function toSymdbFilter(str) {
        let reg = /([^)]+)\(([^)]+)\)/gi

        let matches = reg.exec(str);

        if (!matches) {
            //it didn't match the special filtering format
            //so just return the string as is for an exact
            //match
            return str;
        }

        let filter = matches[1];
        let value = matches[2];

        let map = {
            'gt' : SymDb.gt
            , 'gte' : SymDb.gte
            , 'lt' : SymDb.lt
            , 'lte' : SymDb.lte
            , 'startsWith' : SymDb.startsWith
            , 'contains' : SymDb.contains
            //between expects to args, so this currently won't work
            //, 'between' : SymDb.between
            //compare expects a function, so this won't work
            // , 'compare' : SymDb.compare
        };

        if (!map[filter]) {
            //we don't have a matching filter, so we'll just return the value
            return value;
        }

        return map[filter](value);
    }
}