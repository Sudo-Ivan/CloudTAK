import { Connection } from './schema.js';
import { InferSelectModel, sql } from 'drizzle-orm';
import Config from './config.js';

export type ConnectionAuth = {
    cert: string;
    key: string;
}

export type MissionSub = {
    name: string;
    token?: string;
}

export default interface ConnectionConfig {
    id: string | number;
    name: string;
    enabled: boolean;
    auth: ConnectionAuth;
    config: Config;

    subscription: (name: string) => Promise<null | MissionSub>;
    subscriptions: () => Promise<Array<MissionSub>>;
}

export class MachineConnConfig implements ConnectionConfig {
    id: number;
    name: string;
    enabled: boolean;
    auth: ConnectionAuth;
    config: Config;

    constructor(config: Config, connection: InferSelectModel<typeof Connection>) {
        this.config = config;
        this.id = connection.id;
        this.name = connection.name;
        this.enabled = connection.enabled;
        this.auth = connection.auth;
    }

    async subscription(name: string): Promise<null | MissionSub> {
        const missions = await this.config.models.Data.list({
            where: sql`
                name = ${name}
                AND connection = ${this.id}::INT
                AND mission_sync IS True
            `
        });

        if (missions.items.length === 0) {
            return null;
        }

        return {
            name: missions.items[0].name,
            token: missions.items[0].mission_token
        };
    }

    async subscriptions(): Promise<Array<MissionSub>> {
        const missions = await this.config.models.Data.list({
            where: sql`
                connection = ${this.id}::INT
                AND mission_sync IS True
            `
        });

        return missions.items.map((m) => {
            return { name: m.name, token: m.mission_token }
        });
    }
}

export class ProfileConnConfig implements ConnectionConfig {
    id: string;
    name: string;
    enabled: boolean;
    auth: ConnectionAuth;
    config: Config;

    constructor(
        config: Config,
        email: string,
        auth: ConnectionAuth
    ) {
        this.config = config;
        this.id = email;
        this.name = email;
        this.enabled = true;
        this.auth = auth;
    }

    async subscription(name: string): Promise<null | MissionSub> {
        const missions = await this.config.models.ProfileOverlay.list({
            where: sql`
                name = ${name}
                AND mode = 'mission'
                AND username = ${this.id}
            `
        });

        if (missions.items.length === 0) {
            return null;
        }

        return {
            name: missions.items[0].name,
            token: missions.items[0].token
        };
    }

    async subscriptions(): Promise<Array<MissionSub>> {
        const missions = await this.config.models.ProfileOverlay.list({
            where: sql`
                mode = 'mission'
                AND username = ${this.id}
            `
        });

        return missions.items.map((m) => {
            return { name: m.name, token: m.token }
        })
    }
}

