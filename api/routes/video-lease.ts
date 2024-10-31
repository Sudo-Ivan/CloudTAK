import { Type } from '@sinclair/typebox'
import moment from 'moment';
import Schema from '@openaddresses/batch-schema';
import Err from '@openaddresses/batch-error';
import Auth, { AuthUserAccess } from '../lib/auth.js';
import Config from '../lib/config.js';
import { sql } from 'drizzle-orm';
import { Token } from '../lib/schema.js';
import { randomUUID } from 'node:crypto';
import { StandardResponse, VideoLeaseResponse } from '../lib/types.js';
import ECSVideoControl, { Protocols } from '../lib/control/video-service.js';
import * as Default from '../lib/limits.js';

export default async function router(schema: Schema, config: Config) {
    const videoControl = new ECSVideoControl(config);

    await schema.get('/video/lease', {
        name: 'List Leases',
        group: 'VideoLease',
        description: 'List all video leases',
        query: Type.Object({
            limit: Default.Limit,
            page: Default.Page,
            order: Default.Order,
            sort: Type.Optional(Type.String({ default: 'created', enum: Object.keys(Token) })),
            ephemeral: Type.Optional(Type.Boolean({ default: false })),
            filter: Default.Filter
        }),
        res: Type.Object({
            total: Type.Integer(),
            items: Type.Array(VideoLeaseResponse)
        })
    }, async (req, res) => {
        try {
            const user = await Auth.as_user(config, req);

            const list = await config.models.VideoLease.list({
                limit: req.query.limit,
                page: req.query.page,
                order: req.query.order,
                sort: req.query.sort,
                where: sql`
                    name ~* ${req.query.filter}
                    AND username = ${user.email}
                    AND ephemeral = ${req.query.ephemeral}
                `
            });

            res.json(list);
        } catch (err) {
             Err.respond(err, res);
        }
    });

    await schema.get('/video/lease/:lease', {
        name: 'Get Lease',
        group: 'VideoLease',
        description: 'Get a single Video Lease',
        params: Type.Object({
            lease: Type.String()
        }),
        res: Type.Object({
            lease: VideoLeaseResponse,
            protocols: Protocols
        })
    }, async (req, res) => {
        try {
            const user = await Auth.as_user(config, req);

            let lease;
            if (user.access === AuthUserAccess.ADMIN) {
                lease = await config.models.VideoLease.from(req.params.lease);
            } else {
                lease = await config.models.VideoLease.from(req.params.lease);

                if (lease.username !== user.email) {
                    throw new Err(400, null, 'You can only delete a lease you created');
                }
            }

            res.json({
                lease,
                protocols: await videoControl.protocols(lease)
            });
        } catch (err) {
             Err.respond(err, res);
        }
    });

    await schema.post('/video/lease', {
        name: 'Create Lease',
        group: 'VideoLease',
        description: 'Create a new video Lease',
        body: Type.Object({
            name: Type.String({
                description: 'Human readable name'
            }),
            ephemeral: Type.Boolean({
                description: 'CloudTAK View lease - hidden in streaming list',
                default: false
            }),
            duration: Type.Integer({
                minimum: 0,
                description: 'Duration in Seconds'
            }),
            path: Type.Optional(Type.String()),
            stream_user: Type.Optional(Type.String()),
            stream_pass: Type.Optional(Type.String()),

            proxy: Type.Optional(Type.String())
        }),
        res: Type.Object({
            lease: VideoLeaseResponse,
            protocols: Protocols
        })
    }, async (req, res) => {
        try {
            const user = await Auth.as_user(config, req);

            if (user.access !== AuthUserAccess.ADMIN && req.body.duration > 60 * 60 * 16) {
                throw new Err(400, null, 'Only Administrators can request a lease > 16 hours')
            }

            const lease = await videoControl.generate({
                name: req.body.name,
                ephemeral: req.body.ephemeral,
                expiration: moment().add(req.body.duration, 'seconds').toISOString(),
                path: req.body.path || randomUUID(),
                username: user.email,
                proxy: req.body.proxy
            })

            res.json({
                lease,
                protocols: await videoControl.protocols(lease)
            });
        } catch (err) {
             Err.respond(err, res);
        }
    });

    await schema.patch('/video/lease/:lease', {
        name: 'Update Lease',
        group: 'VideoLease',
        description: 'Update a video Lease',
        params: Type.Object({
            lease: Type.String()
        }),
        body: Type.Object({
            name: Type.Optional(Type.String()),
            duration: Type.Optional(Type.Integer({
                minimum: 0,
                description: 'Duration in Seconds'
            })),
        }),
        res: Type.Object({
            lease: VideoLeaseResponse,
            protocols: Protocols
        })
    }, async (req, res) => {
        try {
            const user = await Auth.as_user(config, req);

            if (user.access !== AuthUserAccess.ADMIN && req.body.duration && req.body.duration > 60 * 60 * 16) {
                throw new Err(400, null, 'Only Administrators can request a lease > 16 hours')
            }

            const lease = await videoControl.commit(req.params.lease, req.body, {
                username: user.email,
                admin: user.access === AuthUserAccess.ADMIN
            });

            res.json({
                lease,
                protocols: await videoControl.protocols(lease)
            });
        } catch (err) {
             Err.respond(err, res);
        }
    });

    await schema.delete('/video/lease/:lease', {
        name: 'Delete Lease',
        group: 'VideoLease',
        description: 'Delete a video Lease',
        params: Type.Object({
            lease: Type.String()
        }),
        res: StandardResponse
    }, async (req, res) => {
        try {
            const user = await Auth.as_user(config, req);

            if (user.access === AuthUserAccess.ADMIN) {
                await videoControl.delete(req.params.lease);
            } else {
                const lease = await config.models.VideoLease.from(req.params.lease);

                if (lease.username === user.email) {
                    await videoControl.delete(req.params.lease);
                } else {
                    throw new Err(400, null, 'You can only delete a lease you created');
                }
            }

            res.json({
                status: 200,
                message: 'Video Lease Deleted'
            });
        } catch (err) {
             Err.respond(err, res);
        }
    });
}
