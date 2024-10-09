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
npx jinaga-export-postgres --host <host> --port <port> --database <database> --user <user> --password <password> --format <format>
```

Replace the placeholders with your PostgreSQL database details:

- `<host>`: The hostname of your PostgreSQL server
- `<port>`: The port number of your PostgreSQL server
- `<database>`: The name of your Jinaga database
- `<user>`: The username for accessing the database
- `<password>`: The password for the specified user
- `<format>`: The output format. Must be either 'json' or 'factual'

Example:

```bash
npx jinaga-export-postgres --host localhost --port 5432 --database myjinagarecords --user myuser --password mypassword --format json
```

The tool will connect to the specified PostgreSQL database, check for the existence of the 'fact' table, and if it exists, export all facts from the table in the specified format.

## Output Formats

The exported data is streamed to stdout in either JSON or Factual format, depending on the --format option.

### JSON Format

When using the JSON format (--format json), the output is an array of fact objects, where each fact object has the following structure:

```json
{
  "hash": "string",
  "type": "string",
  "predecessors": {
    "single": {
      "hash": "string",
      "type": "string"
    },
    "multiple": [
      {
        "hash": "string",
        "type": "string"
      },
      {
        "hash": "string",
        "type": "string"
      }
    ]
  },
  "fields": {
    "key": "value"
  }
}
```

- `hash`: A unique identifier for the fact
- `type`: The type of the fact
- `predecessors`: An object containing references to predecessor facts
  - Each key in the object may contain either a single predecessor or an array of multiple predecessors
- `fields`: An object containing the fact's data fields

### Factual Format

When using the Factual format (--format factual), the output is a series of JavaScript-like fact declarations. Each fact is represented as follows:

```javascript
let f<fact_id>: <fact_type> = {
    <field_key>: <field_value>,
    ...
    <predecessor_key>: f<predecessor_fact_id>,
    <predecessor_array_key>: [f<predecessor_fact_id1>, f<predecessor_fact_id2>, ...],
    ...
}
```

- `<fact_id>`: A unique identifier for the fact
- `<fact_type>`: The type of the fact
- `<field_key>` and `<field_value>`: The fact's data fields
- `<predecessor_key>` and `<predecessor_fact_id>`: References to single predecessor facts
- `<predecessor_array_key>`: References to arrays of predecessor facts

Example of Factual format output:

```typescript
let f1: Blog.Site = {
    domain: "example.com"
}

let f2: Blog.Post = {
    createdAt: "2023-05-20T10:30:00Z",
    site: f1
}

let f3: Blog.Post.Title = {
    post: f2,
    value: "My First Blog Post",
    prior: []
}
```

## Working with the Output

### Writing to a File

To save the output to a file, you can use output redirection:

For JSON format:

```bash
npx jinaga-export-postgres --host localhost --port 5432 --database mydb --user myuser --password mypassword --format json > output.json
```

For Factual format:

```bash
npx jinaga-export-postgres --host localhost --port 5432 --database mydb --user myuser --password mypassword --format factual > output.fact
```

### Using jq for Processing (JSON format only)

[jq](https://stedolan.github.io/jq/) is a lightweight command-line JSON processor. You can pipe the output of jinaga-export-postgres to jq for further processing or formatting when using the JSON format:

1. Pretty-print the JSON:
   ```bash
   npx jinaga-export-postgres ... --format json | jq '.'
   ```

2. Count the number of facts:
   ```bash
   npx jinaga-export-postgres ... --format json | jq 'length'
   ```

3. Filter facts by type:
   ```bash
   npx jinaga-export-postgres ... --format json | jq '[.[] | select(.type == "YourFactType")]'
   ```

4. Find a fact by hash:
   ```bash
   npx jinaga-export-postgres ... --format json | jq '.[] | select(.hash == "YourFactHash")'
   ```

5. Extract specific fields:
   ```bash
   npx jinaga-export-postgres ... --format json | jq '[.[] | {hash: .hash, type: .type}]'
   ```

Remember to install jq (`sudo apt-get install jq` on Ubuntu or `brew install jq` on macOS) before using these commands.

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
   node dist/index.js --host localhost --port 5432 --database mydb --user myuser --password mypassword --format json
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