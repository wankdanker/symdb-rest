#!/usr/bin/env node
const SymdbRest = require('./app');
const argv = require('yargs').argv;

// get the root directory of the symdb database/collections
const root = argv.root || process.env.SYMDB_REST_ROOT || '/opt/symdb';

// get the port number on which we want to listen
const port = argv.port || process.env.SYMDB_REST_PORT || 8787;

// initialize the SymdbRest app
const app = SymdbRest({
    root : root
});

// start listening
app.listen(port);