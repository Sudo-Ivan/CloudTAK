import Err from '@openaddresses/batch-error';
import Config from '../config.js';
import { Type, Static } from '@sinclair/typebox';
import { VideoLeaseResponse } from '../types.js';
import fetch from '../fetch.js';

export const Protocols = Type.Object({
    rtmp: Type.Optional(Type.Object({
        name: Type.String(),
        url: Type.String()
    })),
    rtsp: Type.Optional(Type.Object({
        name: Type.String(),
        url: Type.String()
    })),
    webrtc: Type.Optional(Type.Object({
        name: Type.String(),
        url: Type.String()
    })),
    hls: Type.Optional(Type.Object({
        name: Type.String(),
        url: Type.String()
    })),
    srt: Type.Optional(Type.Object({
        name: Type.String(),
        url: Type.String()
    }))
})

export const VideoConfigUpdate = Type.Object({
    api: Type.Optional(Type.Boolean()),
    metrics: Type.Optional(Type.Boolean()),
    pprof: Type.Optional(Type.Boolean()),
    playback: Type.Optional(Type.Boolean()),
    rtsp: Type.Optional(Type.Boolean()),
    rtmp: Type.Optional(Type.Boolean()),
    hls: Type.Optional(Type.Boolean()),
    webrtc: Type.Optional(Type.Boolean()),
    srt: Type.Optional(Type.Boolean()),
})

export const VideoConfig = Type.Object({
    api: Type.Boolean(),
    apiAddress: Type.String(),

    metrics: Type.Boolean(),
    metricsAddress: Type.String(),

    pprof: Type.Boolean(),
    pprofAddress: Type.String(),

    playback: Type.Boolean(),
    playbackAddress: Type.String(),

    rtsp: Type.Boolean(),
    rtspAddress: Type.String(),
    rtspsAddress: Type.String(),
    rtspAuthMethods: Type.Array(Type.String()),

    rtmp: Type.Boolean(),
    rtmpAddress: Type.String(),
    rtmpsAddress: Type.String(),

    hls: Type.Boolean(),
    hlsAddress: Type.String(),

    webrtc: Type.Boolean(),
    webrtcAddress: Type.String(),

    srt: Type.Boolean(),
    srtAddress: Type.String(),
})

export const PathConfig = Type.Object({
    name: Type.String(),
    source: Type.String(),
    sourceFingerprint: Type.String(),
    sourceOnDemand: Type.Boolean(),
    sourceOnDemandStartTimeout: Type.String(),
    sourceOnDemandCloseAfter: Type.String(),
    maxReaders: Type.Integer(),

    record: Type.Boolean(),
});

export const PathListConfig = Type.Object({
    name: Type.String(),
    confName: Type.String(),
    source: Type.Union([
        Type.Object({
            id: Type.String(),
            type: Type.String(),
        }),
        Type.Null()
    ]),
    ready: Type.Boolean(),
    readyTime: Type.Union([Type.String(), Type.Null()]),
    tracks: Type.Array(Type.String()),
    bytesReceived: Type.Integer(),
    bytesSent: Type.Integer(),
    readers: Type.Array(Type.Object({
        type: Type.String(),
        id: Type.String()
    }))
})

export const PathsListConfig = Type.Object({
    pageCount: Type.Integer(),
    itemCount: Type.Integer(),
    items: Type.Array(PathListConfig)
})

export const Configuration = Type.Object({
    configured: Type.Boolean(),
    url: Type.Optional(Type.String()),
    config: Type.Optional(VideoConfig),
    paths: Type.Optional(Type.Array(PathListConfig))
});

export default class VideoServiceControl {
    config: Config;

    constructor(config: Config) {
        this.config = config;
    }

    async settings(): Promise<{
        configured: boolean;
        url?: string;
        username?: string;
        password?: string;
    }> {
        let video, user, pass;

        try {
            video = await this.config.models.Setting.from('media::url');
            user = await this.config.models.Setting.from('media::username');
            pass = await this.config.models.Setting.from('media::password');
        } catch (err) {
            if (err instanceof Error && err.message.includes('Not Found')) {
                return {
                    configured: false
                }
            } else {
                throw new Err(500, err instanceof Error ? err : new Error(String(err)), 'Media Service Configuration Error');
            }
        }

        return {
            configured: true,
            url: video.value,
            username: user.value,
            password: pass.value,
        }
    }

    headers(username?: string, password?: string): Headers {
        const headers = new Headers();
        if (username && password) {
            headers.append('Authorization', `Basic ${Buffer.from(username + ':' + password).toString('base64')}`);
        }

        return headers;
    }

    async configure(config: Static<typeof VideoConfigUpdate>): Promise<Static<typeof Configuration>> {
        const video = await this.settings();
        if (!video.configured) return video;

        const headers = this.headers(video.username, video.password);
        headers.append('Content-Type', 'application/json');

        const url = new URL('/v3/config/global/patch', video.url);
        url.port = '9997';

        const res = await fetch(url, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(config)
        });

        if (!res.ok) throw new Err(500, null, await res.text())

        return this.configuration();
    }

    async configuration(): Promise<Static<typeof Configuration>> {
        const video = await this.settings();

        if (!video.configured) return video;

        const headers = this.headers(video.username, video.password);

        const url = new URL('/v3/config/global/get', video.url);
        url.port = '9997';

        const res = await fetch(url, { headers })
        if (!res.ok) throw new Err(500, null, await res.text())
        const body = await res.typed(VideoConfig);

        const urlPaths = new URL('/v3/paths/list', video.url);
        urlPaths.port = '9997';

        const resPaths = await fetch(urlPaths, { headers })
        if (!resPaths.ok) throw new Err(500, null, await resPaths.text())

        const paths = await resPaths.typed(PathsListConfig);

        return {
            configured: video.configured,
            url: video.url,
            config: body,
            paths: paths.items,
        };
    }

    async protocols(lease: Static<typeof VideoLeaseResponse>): Promise<Static<typeof Protocols>> {
        const protocols: Static<typeof Protocols> = {};
        const c = await this.configuration();

        if (!c.configured || !c.url) return protocols;

        if (c.config && c.config.rtsp) {
            // Format: rtsp://localhost:8554/mystream
            const url = new URL(`/${lease.path}`, c.url.replace(/^http(s)?:/, 'rtsp:'))
            url.port = c.config.rtspAddress.replace(':', '');

            protocols.rtsp = {
                name: 'Real-Time Streaming Protocol (RTSP)',
                url: String(url)
            }
        }

        if (c.config && c.config.rtmp) {
            // Format: rtmp://localhost/mystream
            const url = new URL(`/${lease.path}`, c.url.replace(/^http(s)?:/, 'rtmp:'))
            url.port = c.config.rtmpAddress.replace(':', '');

            if (lease.stream_user) url.searchParams.append('user', lease.stream_user);
            if (lease.stream_pass) url.searchParams.append('pass', lease.stream_pass);

            protocols.rtmp = {
                name: 'Real-Time Messaging Protocol (RTMP)',
                url: String(url)
            }
        }

        if (c.config && c.config.hls) {
            // Format: http://localhost:8888/mystream/index.m3u8
            const url = new URL(`/${lease.path}/index.m3u8`, c.url);
            url.port = c.config.hlsAddress.replace(':', '');

            protocols.hls = {
                name: 'HTTP Live Streaming (HLS)',
                url: String(url)
            }
        }

        if (c.config && c.config.webrtc) {
            // Format: http://localhost:8889/mystream
            const url = new URL(`/${lease.path}`, c.url);
            url.port = c.config.webrtcAddress.replace(':', '');

            protocols.webrtc = {
                name: 'Web Real-Time Communication (WebRTC)',
                url: String(url)
            }
        }

        return protocols;
    }

    async generate(opts: {
        name: string;
        ephemeral: boolean;
        expiration: string;
        path: string;
        username: string;
        proxy?: string;
    }): Promise<Static<typeof VideoLeaseResponse>> {
        const video = await this.settings();

        if (!video.configured) throw new Err(400, null, 'Media Integration is not configured');

        const headers = this.headers(video.username, video.password);

        const lease = await this.config.models.VideoLease.generate({
            name: opts.name,
            expiration: opts.expiration,
            ephemeral: opts.ephemeral,
            path: opts.path,
            username: opts.username,
            proxy: opts.proxy
        });

        const url = new URL(`/v3/config/paths/add/${lease.path}`, video.url);
        url.port = '9997';

        headers.append('Content-Type', 'application/json');

        if (lease.proxy) {
            try {
                const proxy = new URL(lease.proxy);

                // Check for HLS Errors
                if (['http:', 'https:'].includes(proxy.protocol)) {
                    const res = await fetch(proxy);

                    if (res.status === 404) {
                        throw new Err(400, null, 'External Video Server reports Video Stream not found');
                    } else if (!res.ok) {
                        throw new Err(res.status, null, `External Video Server failed stream video - HTTP Error ${res.status}`);
                    }
                }
            } catch (err) {
                if (err instanceof Err) {
                    throw err;
                // @ts-expect-error code is not defined in type
                } else if (err instanceof TypeError && err.code === 'ERR_INVALID_URL') {
                    throw new Err(400, null, 'Invalid Video Stream URL');
                } else {
                    throw new Err(500, err instanceof Error ? err : new Error(String(err)), 'Failed to generate proxy stream');
                }
            }

            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: opts.path,
                    source: opts.proxy,
                    sourceOnDemand: true
                }),
            })

            if (!res.ok) throw new Err(500, null, await res.text())
        } else {
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: opts.path
                }),
            })

            if (!res.ok) throw new Err(500, null, await res.text())
        }

        return lease;
    }

    async path(pathid: string): Promise<Static<typeof PathConfig>> {
        const video = await this.settings();
        if (!video.configured) throw new Err(400, null, 'Media Integration is not configured');

        const headers = this.headers(video.username, video.password);

        const url = new URL(`/v3/config/paths/get/${pathid}`, video.url);
        url.port = '9997';

        const res = await fetch(url, {
            method: 'GET',
            headers,
        });

        return await res.typed(PathConfig);
    }

    async delete(leaseid: string): Promise<void> {
        const video = await this.settings();

        if (!video.configured) throw new Err(400, null, 'Media Integration is not configured');

        const headers = this.headers(video.username, video.password);

        const lease = await this.config.models.VideoLease.from(leaseid);

        await this.config.models.VideoLease.delete(leaseid);

        const url = new URL(`/v3/config/paths/delete/${lease.path}`, video.url);
        url.port = '9997';

        await fetch(url, {
            method: 'DELETE',
            headers,
        })

        return;
    }
}
