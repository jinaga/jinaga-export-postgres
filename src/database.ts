import { Client } from 'pg';
import { DatabaseOptions } from './args';

export async function connectToDatabase(options: DatabaseOptions): Promise<Client> {
    const client = new Client({
        host: options.host,
        port: parseInt(options.port),
        database: options.database,
        user: options.user,
        password: options.password
    });

    try {
        await client.connect();
        console.error('Connected to PostgreSQL database');
        await verifyDatabase(client);
        return client;
    } catch (error) {
        console.error('Error connecting to the database:', error);
        throw error;
    }
}

export async function verifyDatabase(client: Client) {
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

export async function disconnectFromDatabase(client: Client) {
    await client.end();
    console.error('Disconnected from PostgreSQL database');
}