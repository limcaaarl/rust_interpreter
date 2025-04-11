import { initialise } from "conductor/src/conductor/runner/util";
import { RustEvaluator } from "./RustEvaluator";
import { ILink } from "conductor/src/conduit";
import { exit } from "process";
import { TypeChecker } from "./typechecker/TypeChecker";
import { generateJsonAst } from "./Utils";

// Create a custom link object implementing ILink interface for Node.js environment
// This is a mock implementation since we're not using web workers
const customLink: ILink = {
    postMessage: function(message: any, transfer?: Transferable[] | StructuredSerializeOptions) {
        // No-op in Node.js as we don't need actual message passing
    },
    addEventListener: (type: string, listener: (event: any) => void) => {
        // No-op in Node.js as we don't need event listeners
    },
    terminate: () => {
        // Terminate the process when done
        exit();
    }
};

// Initialize Conductor with RustEvaluator and custom link
const { runnerPlugin, conduit } = initialise(RustEvaluator, customLink);

async function main() {
    const evaluator = new RustEvaluator(runnerPlugin);

    const code = `
        fn main() {
            1
        }

        fn test() {
        }
    `;

    try {
        // const result = await evaluator.evaluateChunk(code);

        const jsonAst = generateJsonAst(code);
        console.log(JSON.stringify(jsonAst, null, 2));
        const result = new TypeChecker().checkNode(jsonAst);
        console.log('Result:', result);
    } catch (error) {
        console.error(error);
    }

    customLink.terminate();
}

main();
