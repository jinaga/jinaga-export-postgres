#!/usr/bin/env node

import { Client } from 'pg';

interface DatabaseOptions {
    host: string;
    port: string;
    database: string;
    user: string;
    password: string;
}

async function main() {
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

    const { host, port, database, user, password } = options as DatabaseOptions;

    const client = new Client({
        host,
        port: parseInt(port),
        database,
        user,
        password
    });

    try {
        await client.connect();
        console.log('Connected to PostgreSQL database');

        console.log('Exporting data...');
        
        // Check if the 'fact' table exists
        const tableCheckResult = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public'
                AND table_name = 'fact'
            );
        `);

        if (!tableCheckResult.rows[0].exists) {
            console.error("Error: 'fact' table does not exist in the database.");
            process.exit(1);
        }

        // Fetch all facts from the 'fact' table
        const result = await client.query('SELECT * FROM fact');
        const facts = result.rows;

        console.log(`Found ${facts.length} facts:`);
        facts.forEach((fact: any, index: number) => {
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