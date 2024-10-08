#!/usr/bin/env node

import { Client } from 'pg';
import { Readable } from 'stream';
import * as JSONStream from 'jsonstream';
import Cursor from 'pg-cursor';

interface DatabaseOptions {
    host: string;
    port: string;
    database: string;
    user: string;
    password: string;
}

interface PredecessorInformation {
    hash: string;
    type: string;
}

interface FactInformation {
    hash: string;
    type: string;
    predecessors: { [key: string]: PredecessorInformation | PredecessorInformation[] };
    fields: { [key: string]: string | number | boolean | null };
}

async function main() {
    const options = parseArgs();
    const client = createDatabaseClient(options);

    try {
        await client.connect();
        console.error('Connected to PostgreSQL database');

        console.error('Exporting data...');
        
        await verifyDatabase(client);

        const factStream = await streamFacts(client);

        // Use JSONStream to stringify facts as they come in
        factStream
            .pipe(JSONStream.stringify('[', ',', ']'))
            .pipe(process.stdout);

        await new Promise((resolve, reject) => {
            factStream.on('end', resolve);
            factStream.on('error', reject);
        });

        await client.end();
        console.error('Disconnected from PostgreSQL database');
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error('Error:', error.message);
        } else {
            console.error('An unknown error occurred');
        }
        process.exit(1);
    }
}

main();

function parseArgs(): DatabaseOptions {
    const args = process.argv.slice(2);
    if (args.length !== 10 || args.some((arg, index) => index % 2 === 0 && !arg.startsWith('--'))) {
        console.error('Usage: jinaga-export-postgres --host <host> --port <port> --database <database> --user <user> --password <password>');
        process.exit(1);
    }

    const options: Partial<DatabaseOptions> = {};
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].slice(2) as keyof DatabaseOptions;
        options[key] = args[i + 1];
    }

    return options as DatabaseOptions;
}

function createDatabaseClient(options: DatabaseOptions) {
    const { host, port, database, user, password } = options;

    const client = new Client({
        host,
        port: parseInt(port),
        database,
        user,
        password
    });
    return client;
}

async function verifyDatabase(client: Client) {
    // Check if the 'fact' table exists
    const tableCheckResult = await client.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public'
            AND table_name = 'fact'
        );
    `);

    if (!tableCheckResult.rows[0].exists) {
        throw new Error("'fact' table does not exist in the database.");
    }
}

async function streamFacts(client: Client): Promise<Readable> {
    const query = `
        SELECT 
            f.hash,
            ft.name AS type,
            f.data->'fields' AS fields,
            f.data->'predecessors' AS predecessors
        FROM fact f
        JOIN fact_type ft ON f.fact_type_id = ft.fact_type_id
    `;

    const cursor = client.query(new Cursor(query));
    const batchSize = 1000;

    return new Readable({
        objectMode: true,
        async read() {
            try {
                const rows = await cursor.read(batchSize);
                if (rows.length === 0) {
                    this.push(null);
                    await cursor.close();
                } else {
                    for (const row of rows) {
                        const factInfo: FactInformation = {
                            hash: row.hash,
                            type: row.type,
                            predecessors: row.predecessors,
                            fields: row.fields
                        };
                        this.push(factInfo);
                    }
                }
            } catch (error) {
                this.destroy(error as Error);
            }
        }
    });
}
