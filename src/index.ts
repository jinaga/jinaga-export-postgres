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
    format: string;
}

interface PredecessorInformation {
    hash: string;
    type: string;
}

type PredecessorInformationWithId = PredecessorInformation & { fact_id: number };

interface FactInformation {
    hash: string;
    type: string;
    predecessors: { [key: string]: PredecessorInformation | PredecessorInformation[] };
    fields: { [key: string]: string | number | boolean | null };
}

interface FactInformationWithId {
    fact_id: number;
    hash: string;
    type: string;
    predecessors: { [key: string]: PredecessorInformationWithId | PredecessorInformationWithId[] };
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

        if (options.format === 'json') {
            const factStream = await streamFacts(client, stripIdFromFact);

            // Use JSONStream to stringify facts as they come in
            factStream
                .pipe(JSONStream.stringify('[', ',', ']'))
                .pipe(process.stdout);

            await new Promise((resolve, reject) => {
                factStream.on('end', resolve);
                factStream.on('error', reject);
            });
        } else {
            // For 'factual' format, we'll implement this later
            console.error('Factual format not yet implemented');
            process.exit(1);
        }

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
    if (args.length !== 12 || args.some((arg, index) => index % 2 === 0 && !arg.startsWith('--'))) {
        console.error('Usage: jinaga-export-postgres --host <host> --port <port> --database <database> --user <user> --password <password> --format <json|factual>');
        process.exit(1);
    }

    const options: Partial<DatabaseOptions> = {};
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].slice(2) as keyof DatabaseOptions;
        options[key] = args[i + 1];
    }

    if (options.format !== 'json' && options.format !== 'factual') {
        console.error('Invalid format. Use either "json" or "factual".');
        process.exit(1);
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

async function streamFacts<T>(client: Client, map: (fact: FactInformationWithId) => T): Promise<Readable> {
    const query = `
        WITH predecessor AS (
            SELECT
                f.fact_id,
                f.hash,
                ft.name AS type,
                e.successor_fact_id
            FROM fact f
            JOIN fact_type ft ON f.fact_type_id = ft.fact_type_id
            JOIN edge e ON e.predecessor_fact_id = f.fact_id
        ),
        aggregated_predecessors AS (
            SELECT
                successor_fact_id,
                jsonb_agg(jsonb_build_object(
                    'hash', hash,
                    'type', type,
                    'fact_id', fact_id
                )) AS predecessor_array
            FROM predecessor
            GROUP BY successor_fact_id
        )
        SELECT
            f.fact_id,
            f.hash,
            ft.name AS type,
            f.data->'fields' AS fields,
            f.data->'predecessors' AS predecessors,
            ap.predecessor_array
        FROM fact f
        JOIN fact_type ft ON f.fact_type_id = ft.fact_type_id
        JOIN aggregated_predecessors ap ON ap.successor_fact_id = f.fact_id
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
                        const factInfo: FactInformationWithId = {
                            fact_id: row.fact_id,
                            hash: row.hash,
                            type: row.type,
                            predecessors: row.predecessors,
                            fields: row.fields
                        };
                        const predecessorArray = row.predecessor_array as PredecessorInformationWithId[];
                        let allPredecessorsFound = true;
    
                        // Replace each predecessor object with the corresponding object from predecessorArray.
                        for (const key in factInfo.predecessors) {
                            const predecessor = factInfo.predecessors[key];
                            if (Array.isArray(predecessor)) {
                                let newPredecessor: PredecessorInformationWithId[] = [];
                                for (const p of predecessor) {
                                    const found = findPredecessor(predecessorArray, p);
                                    if (found) {
                                        newPredecessor.push(found);
                                    } else {
                                        allPredecessorsFound = false;
                                        break;
                                    }
                                }
                                if (!allPredecessorsFound) break;
                                factInfo.predecessors[key] = newPredecessor;
                            } else {
                                const found = findPredecessor(predecessorArray, predecessor);
                                if (found) {
                                    factInfo.predecessors[key] = found;
                                } else {
                                    allPredecessorsFound = false;
                                    break;
                                }
                            }
                        }
    
                        if (allPredecessorsFound) {
                            this.push(map(factInfo));
                        }
                    }
                }
            } catch (error) {
                this.destroy(error as Error);
            }
        }
    });
}

function findPredecessor(predecessorArray: PredecessorInformationWithId[], p: PredecessorInformationWithId): PredecessorInformationWithId | undefined {
    return predecessorArray.find(pa => pa.type === p.type && pa.hash === p.hash);
}

function stripIdFromPredecessor(predecessor: PredecessorInformationWithId): PredecessorInformation {
    const { fact_id, ...stripped } = predecessor;
    return stripped;
}

function stripIdFromFact(fact: FactInformationWithId): FactInformation {
    const { fact_id, predecessors, ...stripped } = fact;
    const strippedPredecessors: { [key: string]: PredecessorInformation | PredecessorInformation[] } = {};
    for (const key in predecessors) {
        const predecessor = predecessors[key];
        if (Array.isArray(predecessor)) {
            strippedPredecessors[key] = predecessor.map(stripIdFromPredecessor);
        } else {
            strippedPredecessors[key] = stripIdFromPredecessor(predecessor);
        }
    }
    return {
        ...stripped,
        predecessors: strippedPredecessors
    }
}