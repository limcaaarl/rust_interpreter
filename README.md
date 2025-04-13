## Conductor Evaluator URL
```
https://limcaaarl.github.io/rust_interpreter/index.js
```

## Project Setup

To set up this project, follow these steps:

1. **Clone the Repository**

   ```bash
   git clone https://github.com/limcaaarl/rust_interpreter.git
   cd rust_interpreter
   ```

2. **Install Dependencies**

   Ensure you have [Node.js](https://nodejs.org/) and [Corepack](https://nodejs.org/api/corepack.html) installed. Corepack is included with Node.js starting from version 16.10.0. To enable Corepack, run:
   ```bash
   corepack enable
   ```
   Then, install the dependencies:
   ```bash
   yarn install
   ```

3. **Generate the Parser**

   Before building the project, generate the Rust lexer and parser by running:
   ```bash
   yarn generate-parser
   ```

4. **Build the Project**

   To build the project for SourceAcademy usage, run:
   ```bash
   yarn build
   ```
   Then, to build the project locally, run:
   ```bash
   yarn build-local
   ```

5. **Run Tests**

   To ensure everything is working correctly, execute the tests:
   ```bash
   yarn run-tests
   ```


You can now start developing or modifying the project as needed. Refer to the existing sections in this README for further guidance.

## Generate Parser & Visitor
This repository is already configured to generate the parser and visitor from your grammar. Just run:

```bash
yarn generate-parser
```

This spits out your lexer, parser, and a visitor in src/parser/src.

## Bundle into a Single JS File
The rollup config (in rollup.config.index.js) already uses src/index.ts as entry, so just run:

```bash
yarn build
```
This produces a bundled file at dist/index.js that’s fully conductor-compatible.

## Load Your Evaluator into SourceAcademy Playground
After running yarn build, if there are no problems, a `dist/index.js` file will be generated. This is the file that will be used to run your implementation of the language.

This repository has been configured to automatically build your runner and deploy it to GitHub Pages upon pushing to the main branch on GitHub. You should be able to find it at:
```
https://<your_github_username>.github.io/<repo_name>/index.js
```

Enjoy!
