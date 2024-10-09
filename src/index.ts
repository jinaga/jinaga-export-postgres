#!/usr/bin/env node

import * as JSONStream from 'jsonstream';
import { Client } from 'pg';
import Cursor from 'pg-cursor';
import { Readable } from 'stream';
import { parseArgs } from './args';
import { connectToDatabase, disconnectFromDatabase } from './database';

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
    let client: Client;

    try {
        client = await connectToDatabase(options);
        console.error('Exporting data...');

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
        } else if (options.format === 'factual') {
            const factStream = await streamFacts(client, writeFactual);
            factStream.pipe(process.stdout);

            await new Promise((resolve, reject) => {
                factStream.on('end', resolve);
                factStream.on('error', reject);
            });
        } else {
            console.error('Invalid format specified');
            process.exit(1);
        }

        await disconnectFromDatabase(client);
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
            COALESCE(ap.predecessor_array, '{}'::jsonb) AS predecessor_array
        FROM fact f
        JOIN fact_type ft ON f.fact_type_id = ft.fact_type_id
        LEFT JOIN aggregated_predecessors ap ON ap.successor_fact_id = f.fact_id
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

function writeFactual(fact: FactInformationWithId): string {
    let output = `let f${fact.fact_id}: ${fact.type} = {\n`;

    // Output fields
    for (const [key, value] of Object.entries(fact.fields)) {
        output += `    ${key}: ${JSON.stringify(value)},\n`;
    }

    // Output predecessors
    for (const [key, value] of Object.entries(fact.predecessors)) {
        if (Array.isArray(value)) {
            output += `    ${key}: [${value.map(p => `f${p.fact_id}`).join(', ')}],\n`;
        } else {
            output += `    ${key}: f${value.fact_id},\n`;
        }
    }

    // Remove the trailing comma and newline
    output = output.slice(0, -2);
    output += '\n}\n\n';

    return output;
}