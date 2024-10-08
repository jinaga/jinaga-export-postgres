#!/usr/bin/env node

import { Client } from 'pg';

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
        console.log('Connected to PostgreSQL database');

        console.log('Exporting data...');
        
        await verifyDatabase(client);

        const facts: FactInformation[] = await fetchFacts(client);

        console.log(`Found ${facts.length} facts:`);
        facts.forEach((fact: FactInformation, index: number) => {
            console.log(`\nFact ${index + 1}:`);
            console.log(JSON.stringify(fact, null, 2));
        });

        await client.end();
        console.log('\nDisconnected from PostgreSQL database');
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

async function fetchFacts(client: Client): Promise<FactInformation[]> {
    // Query to fetch facts with their types, and extract fields and predecessors from the data JSON
    const query = `
        SELECT 
            f.hash,
            ft.name AS type,
            f.data->'fields' AS fields,
            f.data->'predecessors' AS predecessors
        FROM fact f
        JOIN fact_type ft ON f.fact_type_id = ft.fact_type_id;
    `;

    try {
        const result = await client.query(query);
        
        return result.rows.map(row => {
            const factInfo: FactInformation = {
                hash: row.hash,
                type: row.type,
                predecessors: row.predecessors,
                fields: row.fields
            };

            return factInfo;
        });
    } catch (error) {
        console.error('Error fetching facts:', error);
        throw error;
    }
}
