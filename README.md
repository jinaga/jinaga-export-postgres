# jinaga-export-postgres

A command-line tool to export data from a Jinaga PostgreSQL database.

## Installation

This package can be used directly via `npx` without installation, or you can install it globally using npm:

```bash
npm install -g jinaga-export-postgres
```

## Usage

To use the tool, run the following command:

```bash
npx jinaga-export-postgres --host <host> --port <port> --database <database> --user <user> --password <password>
```

Replace the placeholders with your PostgreSQL database details:

- `<host>`: The hostname of your PostgreSQL server
- `<port>`: The port number of your PostgreSQL server
- `<database>`: The name of your Jinaga database
- `<user>`: The username for accessing the database
- `<password>`: The password for the specified user

Example:

```bash
npx jinaga-export-postgres --host localhost --port 5432 --database myjinagarecords --user myuser --password mypassword
```

The tool will connect to the specified PostgreSQL database, check for the existence of the 'fact' table, and if it exists, export all facts from the table. The exported facts will be displayed in the console, formatted as JSON for easy readability.

## Development

If you want to contribute to this project or modify it for your own use, follow these steps:

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/jinaga-export-postgres.git
   cd jinaga-export-postgres
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Make your changes in the `src/index.ts` file.

4. Build the project:
   ```bash
   npm run build
   ```

5. Test your changes locally:
   ```bash
   node dist/index.js --host localhost --port 5432 --database mydb --user myuser --password mypassword
   ```

6. If everything works correctly, update the version number in `package.json` and publish the package to npm:
   ```bash
   npm publish
   ```

### Project Structure

- `src/index.ts`: The main source file containing the CLI tool logic
- `dist/`: The output directory for compiled JavaScript files
- `package.json`: Project configuration and dependencies
- `tsconfig.json`: TypeScript compiler configuration

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Requirements

- Node.js version 14.0.0 or higher
- Access to a PostgreSQL database used by Jinaga

## Support

If you encounter any problems or have any questions, please open an issue in the GitHub repository.