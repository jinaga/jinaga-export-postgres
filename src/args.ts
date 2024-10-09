import { Client } from 'pg';

export interface DatabaseOptions {
    host: string;
    port: string;
    database: string;
    user: string;
    password: string;
    format: string;
}

export function parseArgs(): DatabaseOptions {
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

export function createDatabaseClient(options: DatabaseOptions) {
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