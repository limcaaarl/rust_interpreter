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
async function testRust(code: string, expected: any, testName?: string, expectError: boolean = false) {
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
        if (expectError) {
            if (error.toString().includes(expected)) {
                console.log(`✅ Test: ${testName || 'passed'}`);
                return true;
            }
        }
        console.error(`❌ Test ${testName || 'failed'} - Error occurred:`);
        console.error(`Code:\n${code}\n`);
        console.error(`Expected: ${expected}`);
        console.error(`Actual: ${error}`);
        return false;
    }
}

async function runTests() {
    let testsPassed = 0;
    let testsFailed = 0;

    // Helper function to run a test and update counters
    const runTest = async (code: string, expected: any, testName: string, expectError: boolean = false) => {
        const result = await testRust(code, expected, testName, expectError);
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

    // Test 4: Nested blocks with shadowing
    await runTest(
        `fn main() {
            let x = 1;
            {
                let x = 2;
                {
                    let x = 3;
                    x;
                }
                x;
            }
            x;
        }`,
        1,
        "Nested blocks with shadowing"
    );

    // Test 5: Block scope isolation
    await runTest(
        `fn main() {
            {
                let x = 10;
            }
            x;
        }`,
        "Error: Variable 'x' not found",
        "Block scope isolation",
        true
    );

    // Test 9: Block with variable reassignment
    await runTest(
        `fn main() {
            {
                let x = 1;
                x = 2;
                x;
            }
        }`,
        2,
        "Block with variable reassignment"
    );

    // Test 10: Block with empty statement
    await runTest(
        `fn main() {
            {
                let x = 1;
                ;
                x;
            }
        }`,
        1,
        "Block with empty statement"
    );

    // Test 12: Block with variable declaration after use
    await runTest(
        `fn main() {
            {
                x;
                let x = 1;
            }
        }`,
        "Variable 'x' not found",
        "Block with variable declaration after use",
        true
    );

    // Test 15: Block with variable reassignment in nested block
    await runTest(
        `fn main() {
            {
                let x = 1;
                {
                    x = 2;
                    x;
                }
                x;
            }
        }`,
        2,
        "Block with variable reassignment in nested block"
    );

    // Test 16: Block with empty block
    await runTest(
        `fn main() {
            {
                {}
                let x = 1;
                x;
            }
        }`,
        1,
        "Block with empty block"
    );

    // Test 17: Block with nested blocks and variable access
    await runTest(
        `fn main() {
            {
                let x = 1;
                {
                    let y = 2;
                    {
                        x;
                        y;
                    }
                }
            }
        }`,
        2,
        "Block with nested blocks and variable access"
    );

    // Test 18: Block with nested blocks and shadowing with same name
    await runTest(
        `fn main() {
            {
                let x = 1;
                {
                    let x = 2;
                    {
                        let x = 3;
                        x;
                    }
                    x;
                }
                x;
            }
        }`,
        1,
        "Block with nested blocks and shadowing with same name"
    );

    // Test 20: Block with nested blocks and variable reassignment from outer scope
    await runTest(
        `fn main() {
            {
                let x = 1;
                {
                    x = 2;
                    {
                        x = 3;
                        x;
                    }
                    x;
                }
                x;
            }
        }`,
        3,
        "Block with nested blocks and variable reassignment from outer scope"
    );

    // Print summary
    const totalTests = testsPassed + testsFailed;
    console.log(`\nSummary:`);
    console.log(`Passed: ${testsPassed} / ${totalTests}`);
}

runTests().then(() => customLink.terminate());