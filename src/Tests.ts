import { initialise } from "conductor/src/conductor/runner/util";
import { RustEvaluator } from "./RustEvaluator";
import { ILink } from "conductor/src/conduit";
import { exit } from "process";

// Create a custom link object implementing ILink interface for Node.js environment
const customLink: ILink = {
    postMessage: function (message: any, transfer?: Transferable[] | StructuredSerializeOptions) {
        // No-op in Node.js as we don't need actual message passing
    },
    addEventListener: (type: string, listener: (event: any) => void) => {
        // No-op in Node.js as we don't need event listeners
    },
    terminate: () => {
        exit();
    }
};

// Initialize Conductor with RustEvaluator and custom link
const { runnerPlugin, conduit } = initialise(RustEvaluator, customLink);

/**
 * Test function that runs a Rust code block and verifies its result
 * @param code - The Rust code block to test
 * @param expected - The expected result
 * @param testName - Optional name for the test
 */
async function testRust(code: string, expected: any, testName?: string) {
    const evaluator = new RustEvaluator(runnerPlugin);

    try {
        const result = await evaluator.evaluateChunk(code);
        if (result === expected) {
            console.log(`✅ Test: ${testName || 'passed'}`);
            return true;
        } else {
            console.error(`❌ Test ${testName || 'failed'} - Mismatched results:`);
            console.error(`Code:\n${code}\n`);
            console.error(`Expected: ${expected}`);
            console.error(`Actual: ${result}`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Test ${testName || 'failed'} - Error occurred:`);
        console.error(`Code:\n${code}\n`);
        console.error(`Error: ${error}`);
        return false;
    }
}

async function runTests() {
    let testsPassed = 0;
    let testsFailed = 0;

    // Helper function to run a test and update counters
    const runTest = async (code: string, expected: any, testName: string) => {
        const result = await testRust(code, expected, testName);
        if (result) {
            testsPassed++;
        } else {
            testsFailed++;
        }
    };

    // Test 1: Basic variable assignment
    await runTest(
        `fn main() {
            let x = 5;
            x;
        }`,
        5,
        "Variable assignment"
    );

    // Test 2: Variable reassignment
    await runTest(
        `fn main() {
            let x = 5;
            x = 3;
            x;
        }`,
        3,
        "Variable reassignment"
    );

    // Test 3: Variable retrieval
    await runTest(
        `fn main() {
            let x = 3;
            x;
        }`,
        3,
        "Variable retrieval"
    );

    // Test 4: Addition
    await runTest(
        `fn main() {
            1 + 4;
        }`,
        5,
        "Addition"
    );

    // Test 5: Subtraction
    await runTest(
        `fn main() {
            1 - 4;
        }`,
        -3,
        "Subtraction"
    );

    // Test 6: Multiplication
    await runTest(
        `fn main() {
            2 * 4;
        }`,
        8,
        "Multiplication"
    );

    // Test 7: Division
    await runTest(
        `fn main() {
            4 / 2;
        }`,
        2,
        "Division"
    );

    // Test 8: Modulo
    await runTest(
        `fn main() {
            4 % 3;
        }`,
        1,
        "Modulo"
    );

    // Print summary
    const totalTests = testsPassed + testsFailed;
    console.log(`\nSummary:`);
    console.log(`Passed: ${testsPassed} / ${totalTests}`);
}

runTests().then(() => customLink.terminate());