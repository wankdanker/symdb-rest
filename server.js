#!/usr/bin/env node
const UseyHttp = require('usey-http');
const SymdbRest = require('./app');
const argv = require('yargs').argv;

// get the root directory of the symdb database/collections
const root = argv.root || process.env.SYMDB_REST_ROOT || '/opt/symdb';

// get the port number on which we want to listen
const port = argv.port || process.env.SYMDB_REST_PORT || 8787;

// initialize the server
const server = UseyHttp();

// register the query string parser
server.use(UseyHttp.queryParser());

// register the json body parser
server.use(UseyHttp.bodyParser.json({
    limit : '100mb'
}));

// initialize the SymdbRest app
const app = SymdbRest({
    root : root
});

server.use(app);

// start listening
server.listen(port);