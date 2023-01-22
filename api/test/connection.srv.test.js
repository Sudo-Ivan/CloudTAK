import test from 'tape';
import Flight from './flight.js';

const flight = new Flight();

flight.init(test);
flight.takeoff(test);
flight.user(test);

test('GET: api/connection', async (t) => {
    try {
        const res = await flight.fetch('/api/connection', {
            method: 'GET',
            auth: {
                bearer: flight.token.admin
            }
        }, true);

        t.deepEquals(res.body, {
            total: 0,
            connections: [],
            status: {
                dead: 0,
                live: 0,
                unknown: 0
            }
        });
    } catch (err) {
        t.error(err, 'no error');
    }

    t.end();
});

test('GET: api/connection/1', async (t) => {
    try {
        const res = await flight.fetch('/api/connection/1', {
            method: 'GET',
            auth: {
                bearer: flight.token.admin
            }
        }, false);

        t.deepEquals(res.body, {
            status: 404,
            message: 'connections not found',
            messages: []
        });
    } catch (err) {
        t.error(err, 'no error');
    }

    t.end();
});

test('POST: api/connection', async (t) => {
    try {
        const res = await flight.fetch('/api/connection', {
            method: 'POST',
            auth: {
                bearer: flight.token.admin
            },
            body: {
                name: '1st Connection',
                description: 'Pretty Rad',
                auth: {}
            }
        }, false);

        t.deepEquals(res.body, {
            status: 400,
            message: 'TAK Server must be configured before a connection can be made',
            messages: []
        });
    } catch (err) {
        t.error(err, 'no error');
    }

    t.end();
});

flight.landing(test);
